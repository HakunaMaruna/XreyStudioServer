// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { decryptSecret, encryptSecret } from '../../common/secret-crypto';
import { APP_VERSION } from '../../version';
import { Client, ConnectConfig } from 'ssh2';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { ProvisionNodeDto } from './dto/provision.dto';
import { UpdateNodeAgentDto } from './dto/update-agent.dto';

const DEFAULT_REPO = 'https://github.com/HakunaMaruna/XreyStudioServer.git';
const REMOTE_DIR = '/opt/xrey-agent';
const DEFAULT_COMMAND_TIMEOUT_MS = 600_000;
const UPDATE_TIMEOUT_MS = 600_000;
const MAX_OUTPUT = 16_384;
const VERSION_PATTERN = /^v?\d+(?:\.\d+){1,3}(?:-[0-9A-Za-z.-]+)?$/;
// Remote repo path ends up in a shell command; allow only a plain absolute path.
const REPO_DIR_PATTERN = /^\/[A-Za-z0-9._/-]+$/;

const shellQuote = (value: string) => `'${String(value).replace(/'/g, `'\\''`)}'`;

function assertTargetVersion(value?: string): string | undefined {
  if (!value) return undefined;
  const version = value.trim();
  if (!VERSION_PATTERN.test(version)) throw new BadRequestException('Invalid target version');
  return version;
}

type ExecResult = { code: number; output: string };
export type ProvisionProgress = (stage: string, message: string, level?: string) => Promise<void> | void;

// Общие параметры SSH-подключения для установки и обновления агента.
type SshTarget = {
  host: string;
  port?: number;
  username: string;
  hostKeyFingerprint?: string;
  privateKey?: string;
  passphrase?: string;
  password?: string;
};

export function fingerprintMatches(key: Buffer, fingerprint: string): boolean {
  return `SHA256:${createHash('sha256').update(key).digest('base64')}` === fingerprint;
}

@Injectable()
export class NodeProvisionService {
  private readonly logger = new Logger(NodeProvisionService.name);

  constructor(private prisma: PrismaService) {}

  private enabled() {
    if (process.env.SSH_PROVISION_ENABLED !== 'true') {
      throw new ServiceUnavailableException('SSH provisioning is disabled');
    }
  }

  private connect(dto: SshTarget, sock?: any): Promise<Client> {
    const config: ConnectConfig = {
      ...(sock ? { sock: sock as any } : {}),
      host: dto.host,
      port: dto.port || 22,
      username: dto.username,
      // Fingerprint pinning is enforced for key-based auth by the wizard. Password-only
      // auth may omit it; in that case ssh2 falls back to its default TOFU behaviour.
      hostVerifier: (key) => !dto.hostKeyFingerprint || fingerprintMatches(key as Buffer, dto.hostKeyFingerprint),
      readyTimeout: 15_000,
    };
    if (!dto.hostKeyFingerprint) {
      this.logger.warn(`SSH host key fingerprint not pinned for ${dto.host}@${dto.username}`);
    }
    if (dto.privateKey) {
      config.privateKey = dto.privateKey;
      if (dto.passphrase) config.passphrase = dto.passphrase;
      if (dto.password) config.password = dto.password; // key + password fallback
    } else if (dto.password) config.password = dto.password;
    else throw new BadRequestException('privateKey or password is required');

    return new Promise((resolve, reject) => {
      const conn = new Client();
      let settled = false;
      conn.once('ready', () => {
        settled = true;
        resolve(conn);
      });
      conn.once('error', (err) => {
        if (!settled) {
          settled = true;
          reject(new ForbiddenException('SSH connection or host key verification failed'));
        }
      });
      conn.connect(config);
    });
  }

  /** Connect to a target through an already-installed node via SSH forwardOut. */
  private async connectWithJump(dto: SshTarget, jumpNodeId: string): Promise<{ conn: Client; jump: Client | null }> {
    const jumpNode = await this.prisma.node.findUnique({ where: { id: jumpNodeId }, select: { id: true, address: true, organizationId: true } });
    if (!jumpNode) throw new BadRequestException('Jump node not found');
    const credential = await this.prisma.wizardCredential.findUnique({ where: { nodeId: jumpNodeId } });
    if (!credential) throw new BadRequestException('Jump node has no saved SSH credentials');
    const jumpTarget: SshTarget = {
      host: credential.sshHost || jumpNode.address,
      port: credential.sshPort || 22,
      username: credential.sshUser || 'root',
      hostKeyFingerprint: undefined,
    };
    if (credential.password) jumpTarget.password = decryptSecret(credential.password);
    if (credential.privateKey) {
      jumpTarget.privateKey = decryptSecret(credential.privateKey);
      if (credential.passphrase) jumpTarget.passphrase = decryptSecret(credential.passphrase);
    }
    const jump = await this.connect(jumpTarget);
    const sock = await new Promise<any>((resolve, reject) => {
      jump.forwardOut('127.0.0.1', 0, dto.host, dto.port || 22, (error, stream) => {
        if (error || !stream) reject(error || new Error('Jump forwardOut failed'));
        else resolve(stream);
      });
    });
    try {
      const conn = await this.connect(dto, sock);
      return { conn, jump };
    } catch (error) {
      jump.end();
      throw error;
    }
  }

  private async openConnection(dto: SshTarget & { jumpNodeId?: string }) {
    if (dto.jumpNodeId) return this.connectWithJump(dto, dto.jumpNodeId);
    return { conn: await this.connect(dto), jump: null };
  }

  private closeAll(conn: Client, jump: Client | null) {
    this.close(conn);
    if (jump) this.close(jump);
  }

  private commandTimeout() {
    const value = Number(process.env.NODE_PROVISION_COMMAND_TIMEOUT_MS);
    return Number.isFinite(value) && value >= 30_000 ? value : DEFAULT_COMMAND_TIMEOUT_MS;
  }

  /** Keeps secrets out of the live installation terminal. */
  private sanitize(text: string) {
    return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
      .filter((line) => !/(token|password|secret|private.?key|AGENT_TOKEN)/i.test(line))
      .join('\n');
  }

  private runRemoteCommand(
    conn: Client,
    command: string,
    onOutputOrTimeout?: ((text: string) => void) | number,
    label = 'remote command',
  ): Promise<ExecResult> {
    const onOutput = typeof onOutputOrTimeout === 'function' ? onOutputOrTimeout : undefined;
    const timeoutMs = typeof onOutputOrTimeout === 'number' ? onOutputOrTimeout : this.commandTimeout();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new BadRequestException(`Remote command timed out during ${label}`)),
        timeoutMs,
      );
      conn.exec(command, { pty: false }, (err, stream) => {
        if (err) {
          clearTimeout(timer);
          reject(new BadRequestException('Remote command failed to start'));
          return;
        }
        let output = '';
        let pending = '';
        let lastEmit = 0;
        const append = (data: Buffer) => {
          const text = data.toString('utf8');
          output = (output + text).slice(0, MAX_OUTPUT);
          pending = (pending + text).slice(-4000);
          const now = Date.now();
          if (onOutput && now - lastEmit >= 1500 && pending.trim()) {
            lastEmit = now;
            const clean = this.sanitize(pending);
            pending = '';
            if (clean) onOutput(clean.slice(-1200));
          }
        };
        stream.on('data', append);
        stream.stderr.on('data', append);
        stream.on('close', (code: number) => {
          clearTimeout(timer);
          if (onOutput && pending.trim()) {
            const clean = this.sanitize(pending);
            if (clean) onOutput(clean.slice(-1200));
          }
          resolve({ code, output });
        });
      });
    });
  }

  private close(conn: Client) {
    try {
      conn.end();
    } catch {
      // The SSH transport may already be closed; no action is required.
    }
  }

  private sudoPrefix(dto: { useSudo?: boolean }) {
    return dto.useSudo ? 'sudo -n ' : '';
  }

  // `git checkout <тег>` оставляет репозиторий в detached HEAD, где `git pull`
  // падает. Перед pull возвращаемся на ветку: её имя берём из HEAD, а если HEAD
  // отвязан — первую локальную ветку.
  private gitUpdate(sudo: string, targetVersion?: string) {
    const git = `${sudo}git`;
    // Wizard provisioning locally edits docker-compose.node.yml (relay ports and
    // volumes) and writes .env. Those are legitimate local changes: stash them
    // around the checkout, then reapply on top of the new tag.
    const stash = `${git} stash push -u -m "xss-agent-update" >/dev/null 2>&1 || true;`;
    const restore = [
      `if ${git} stash list | grep -q 'xss-agent-update'; then`,
      `  if ! ${git} stash pop --quiet; then`,
      `    ${git} checkout -- . >/dev/null 2>&1 || true;`,
      `    echo 'WARNING: local agent changes were kept in git stash; inspect manually' >&2;`,
      `  fi;`,
      `fi`,
    ].join(' ');
    if (targetVersion) {
      return (
        `${stash} ` +
        `( ${git} rev-parse -q --verify "refs/tags/$targetVersion" >/dev/null && tag=$targetVersion || tag=v$targetVersion; ` +
        `${git} checkout -q "$tag" ); ` +
        restore
      );
    }
    return [
      stash,
      `branch=$(${git} symbolic-ref -q --short HEAD || ${git} for-each-ref --format='%(refname:short)' refs/heads | head -n 1)`,
      `${git} checkout -q "\${branch:-main}"`,
      `${git} pull -q --ff-only`,
      restore,
    ].join('; ');
  }

  private async writeEnv(conn: Client, content: string, dto: ProvisionNodeDto) {
    if (!dto.useSudo) {
      await new Promise<void>((resolve, reject) => {
        conn.sftp((err, sftp) => {
          if (err) {
            reject(new BadRequestException('Remote SFTP is unavailable'));
            return;
          }
          const stream = sftp.createWriteStream(`${REMOTE_DIR}/.env`, { flags: 'w', mode: 0o600 });
          stream.once('error', () => reject(new BadRequestException('Failed to write remote .env')));
          stream.once('close', () => resolve());
          stream.end(content, 'utf8');
        });
      });
      return;
    }
    const tmp = `/tmp/.xss-env-${randomBytes(6).toString('hex')}`;
    await new Promise<void>((resolve, reject) => {
      conn.sftp((err, sftp) => {
        if (err) { reject(new BadRequestException('Remote SFTP is unavailable')); return; }
        const stream = sftp.createWriteStream(tmp, { flags: 'w', mode: 0o600 });
        stream.once('error', () => reject(new BadRequestException('Failed to write remote .env')));
        stream.once('close', () => resolve());
        stream.end(content, 'utf8');
      });
    });
    const move = await this.runRemoteCommand(conn, `install -m 600 -o root -g root ${tmp} ${REMOTE_DIR}/.env && rm -f ${tmp}`);
    if (move.code !== 0) throw new BadRequestException('Failed to install remote .env');
  }

  private async emit(progress: ProvisionProgress | undefined, stage: string, message: string, level = 'info') {
    if (!progress) return;
    try {
      await progress(stage, message, level);
    } catch {
      // Progress reporting must never break provisioning itself.
    }
  }

  /** Remote output can be big and may contain secrets; keep only a short sanitized excerpt. */
  private outputExcerpt(output: string) {
    return this.sanitize(output).split('\n').slice(0, 12).join('\n').slice(0, 2000);
  }

  async provision(dto: ProvisionNodeDto, actor: AuthUser, progress?: ProvisionProgress) {
    this.enabled();
    if (actor.role !== Role.ADMIN && actor.role !== Role.OPERATOR) throw new ForbiddenException('Admin or operator role required');

    const agentToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(agentToken).digest('hex');
    const panelUrl = dto.panelUrl || process.env.PANEL_URL || '';
    if (!panelUrl) throw new BadRequestException('PANEL_URL is not configured');

    const node = await this.prisma.node.create({
      data: {
        name: dto.name,
        address: dto.host,
        port: 443,
        agentUrl: `http://${dto.host}:9090`,
        tokenHash,
        agentSecret: encryptSecret(agentToken),
        jumpNodeId: dto.jumpNodeId || null,
        location: dto.location || null,
        organizationId: actor.organizationId || null,
      },
    });

    await this.emit(progress, 'ssh', `Connecting to ${dto.host}:${dto.port} as ${dto.username}…`);
    const { conn, jump } = await this.openConnection(dto);
    await this.emit(progress, 'ssh', `SSH connection established${dto.jumpNodeId ? ' via jump node' : ''}`);
    try {
      const repo = shellQuote(process.env.NODE_PROVISION_REPO || DEFAULT_REPO);
      const sudo = this.sudoPrefix(dto);
      const setup =
        `set -e; ${sudo}mkdir -p ${REMOTE_DIR}; ` +
        `if ! command -v git >/dev/null 2>&1; then ${sudo}apt-get update -qq && ${sudo}apt-get install -y -qq git ca-certificates; fi; ` +
        `if [ ! -d ${REMOTE_DIR}/.git ]; then ${sudo}git clone --depth 1 ${repo} ${REMOTE_DIR}; fi; ` +
        `${sudo}chmod 700 ${REMOTE_DIR}; ` +
        `if ! command -v docker >/dev/null 2>&1; then curl -fsSL https://get.docker.com | ${sudo}sh; fi`;
      await this.emit(progress, 'prepare', 'Preparing remote directory and Docker…');
      const setupResult = await this.runRemoteCommand(
        conn, setup,
        (text) => { void this.emit(progress, 'prepare', text, 'output'); },
        'server preparation',
      );
      const setupExcerpt = this.outputExcerpt(setupResult.output);
      if (setupExcerpt) await this.emit(progress, 'prepare', setupExcerpt, 'output');
      if (setupResult.code !== 0) {
        throw new BadRequestException('Failed to prepare remote directory or install Docker');
      }
      await this.emit(progress, 'prepare', 'Remote directory and Docker ready');

      const envContent =
        `NODE_ID=${node.id}\nAGENT_TOKEN=${agentToken}\nPANEL_URL=${panelUrl}\nXRAY_MANAGED=true\n`;
      await this.emit(progress, 'env', 'Writing agent configuration (.env)…');
      await this.writeEnv(conn, envContent, dto);
      await this.emit(progress, 'env', 'Agent configuration written');

      await this.emit(progress, 'install', 'Installing agent (install.sh --mode node)…');
      // Pass PANEL_URL explicitly and skip interactive prompts/DNS lookup on the node.
      const quotedPanelUrl = shellQuote(panelUrl);
      const installCommand = sudo
        ? `cd ${REMOTE_DIR} && ${sudo}env PANEL_URL=${quotedPanelUrl} bash install.sh --mode node --yes --domain localhost`
        : `cd ${REMOTE_DIR} && PANEL_URL=${quotedPanelUrl} bash install.sh --mode node --yes --domain localhost`;
      const install = await this.runRemoteCommand(
        conn,
        installCommand,
        (text) => { void this.emit(progress, 'install', text, 'output'); },
        'agent installation',
      );
      const installExcerpt = this.outputExcerpt(install.output);
      if (installExcerpt) await this.emit(progress, 'install', installExcerpt, 'output');
      if (install.code !== 0) {
        throw new BadRequestException('Remote agent installation failed');
      }
      await this.emit(progress, 'install', 'Agent installed successfully');
    } catch (error) {
      await this.prisma.node.delete({ where: { id: node.id } }).catch(() => undefined);
      throw error;
    } finally {
      this.closeAll(conn, jump);
    }

    return {
      nodeId: node.id,
      name: node.name,
      address: node.address,
      agentUrl: node.agentUrl,
      agentToken,
      message: 'Agent installed; wait for the node to report ONLINE',
    };
  }

  private async assertTenantNode(nodeId: string, actor: AuthUser) {
    const node = await this.prisma.node.findFirst({
      where: { id: nodeId, ...(actor.role === Role.ADMIN ? {} : { organizationId: actor.organizationId || null }) },
      select: { id: true, address: true, jumpNodeId: true },
    });
    if (!node) throw new ForbiddenException('Node not found in your organization');
    return node;
  }

  /** One-click update using credentials saved by the node wizard. */
  async updateAgentLatest(nodeId: string, actor: AuthUser) {
    this.enabled();
    if (actor.role !== Role.ADMIN && actor.role !== Role.OPERATOR) throw new ForbiddenException('Admin or operator role required');
    const node = await this.assertTenantNode(nodeId, actor);
    const credential = await this.prisma.wizardCredential.findUnique({ where: { nodeId } });
    if (!credential) throw new BadRequestException('No saved SSH credentials for this node; use manual update');
    const dto: UpdateNodeAgentDto = {
      host: credential.sshHost || node.address,
      port: credential.sshPort || 22,
      username: credential.sshUser || 'root',
      useSudo: (credential.sshUser || 'root') !== 'root',
      jumpNodeId: node.jumpNodeId || undefined,
      targetVersion: APP_VERSION,
      // The wizard does not persist the host key fingerprint; ssh2 falls back to TOFU.
    };
    if (credential.password) dto.password = decryptSecret(credential.password);
    if (credential.privateKey) dto.privateKey = decryptSecret(credential.privateKey);
    if (credential.passphrase) dto.passphrase = decryptSecret(credential.passphrase);
    return this.updateAgent(nodeId, dto as UpdateNodeAgentDto, actor);
  }

  // Обновление агента на ноде: панель заходит по SSH в каталог репозитория
  // (его создаёт provision) и пересобирает только контейнер агента.
  async updateAgent(nodeId: string, dto: UpdateNodeAgentDto, actor: AuthUser) {
    this.enabled();
    if (actor.role !== Role.ADMIN && actor.role !== Role.OPERATOR) throw new ForbiddenException('Admin or operator role required');

    const node = await this.assertTenantNode(nodeId, actor);

    const repoDir = dto.repoDir || REMOTE_DIR;
    if (!REPO_DIR_PATTERN.test(repoDir) || repoDir.includes('..')) {
      throw new BadRequestException('Invalid repository directory');
    }
    const targetVersion = assertTargetVersion(dto.targetVersion);
    const sudo = this.sudoPrefix(dto);
    const command =
      `set -e; cd ${repoDir}; ` +
      `${sudo}git fetch --tags --force origin; ` +
      `${this.gitUpdate(sudo, targetVersion)}; ` +
      // Wizard nodes use docker-compose.node.yml which publishes Reality ports.
      'COMPOSE=$(test -f docker-compose.node.yml && echo "-f docker-compose.node.yml" || true); ' +
      `${sudo}docker compose $COMPOSE build agent; ` +
      `${sudo}docker compose $COMPOSE up -d --no-deps agent`;

    const { conn, jump } = await this.openConnection(dto);
    try {
      const result = await this.runRemoteCommand(conn, command, UPDATE_TIMEOUT_MS);
      if (result.code !== 0) {
        return {
          updated: false,
          nodeId: node.id,
          targetVersion: targetVersion || null,
          error: 'Update command failed',
          output: result.output.slice(-4000),
        };
      }
      if (targetVersion) {
        await this.prisma.node.update({ where: { id: node.id }, data: { agentVersion: targetVersion } });
      }
      return {
        updated: true,
        nodeId: node.id,
        targetVersion: targetVersion || null,
        output: result.output.slice(-4000),
      };
    } finally {
      this.closeAll(conn, jump);
    }
  }
}
