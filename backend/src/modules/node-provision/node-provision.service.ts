import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { Client, ConnectConfig } from 'ssh2';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { ProvisionNodeDto } from './dto/provision.dto';

const DEFAULT_REPO = 'https://github.com/HakunaMaruna/XreyStudioServer.git';
const REMOTE_DIR = '/opt/xrey-agent';
const DEFAULT_COMMAND_TIMEOUT_MS = 600_000;
const MAX_OUTPUT = 16_384;

type ExecResult = { code: number; output: string };
export type ProvisionProgress = (stage: string, message: string, level?: string) => Promise<void> | void;

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

  private connect(dto: ProvisionNodeDto): Promise<Client> {
    const config: ConnectConfig = {
      host: dto.host,
      port: dto.port,
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
    onOutput?: (text: string) => void,
    label = 'remote command',
  ): Promise<ExecResult> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new BadRequestException(`Remote command timed out during ${label}`)),
        this.commandTimeout(),
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

  private sudoPrefix(dto: ProvisionNodeDto) {
    return dto.useSudo ? 'sudo -n ' : '';
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
    if (actor.role !== Role.ADMIN) throw new ForbiddenException('Admin role required');

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
        location: dto.location || null,
        organizationId: actor.organizationId || null,
      },
    });

    await this.emit(progress, 'ssh', `Connecting to ${dto.host}:${dto.port} as ${dto.username}…`);
    const conn = await this.connect(dto);
    await this.emit(progress, 'ssh', 'SSH connection established');
    try {
      const repo = process.env.NODE_PROVISION_REPO || DEFAULT_REPO;
      const sudo = this.sudoPrefix(dto);
      const setup =
        `set -e; ${sudo}mkdir -p ${REMOTE_DIR}; ` +
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
      const quotedPanelUrl = `'${panelUrl.replace(/'/g, `'\\''`)}'`;
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
      this.close(conn);
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
}
