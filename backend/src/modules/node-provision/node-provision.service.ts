import {
  BadRequestException,
  ForbiddenException,
  Injectable,
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
const COMMAND_TIMEOUT_MS = 180_000;
const MAX_OUTPUT = 16_384;

type ExecResult = { code: number; output: string };

export function fingerprintMatches(key: Buffer, fingerprint: string): boolean {
  return `SHA256:${createHash('sha256').update(key).digest('base64')}` === fingerprint;
}

@Injectable()
export class NodeProvisionService {
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
      hostVerifier: (key) => fingerprintMatches(key as Buffer, dto.hostKeyFingerprint),
      readyTimeout: 15_000,
    };
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

  private runRemoteCommand(conn: Client, command: string): Promise<ExecResult> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new BadRequestException('Remote command timed out')),
        COMMAND_TIMEOUT_MS,
      );
      conn.exec(command, { pty: false }, (err, stream) => {
        if (err) {
          clearTimeout(timer);
          reject(new BadRequestException('Remote command failed to start'));
          return;
        }
        let output = '';
        stream.on('data', (data: Buffer) => {
          output = (output + data.toString('utf8')).slice(0, MAX_OUTPUT);
        });
        stream.stderr.on('data', (data: Buffer) => {
          output = (output + data.toString('utf8')).slice(0, MAX_OUTPUT);
        });
        stream.on('close', (code: number) => {
          clearTimeout(timer);
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

  async provision(dto: ProvisionNodeDto, actor: AuthUser) {
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

    const conn = await this.connect(dto);
    try {
      const repo = process.env.NODE_PROVISION_REPO || DEFAULT_REPO;
      const sudo = this.sudoPrefix(dto);
      const setup =
        `set -e; ${sudo}mkdir -p ${REMOTE_DIR}; ` +
        `if [ ! -d ${REMOTE_DIR}/.git ]; then ${sudo}git clone --depth 1 ${repo} ${REMOTE_DIR}; fi; ` +
        `${sudo}chmod 700 ${REMOTE_DIR}; ` +
        `if ! command -v docker >/dev/null 2>&1; then curl -fsSL https://get.docker.com | ${sudo}sh; fi`;
      const setupResult = await this.runRemoteCommand(conn, setup);
      if (setupResult.code !== 0) {
        throw new BadRequestException('Failed to prepare remote directory or install Docker');
      }

      const envContent =
        `NODE_ID=${node.id}\nAGENT_TOKEN=${agentToken}\nPANEL_URL=${panelUrl}\nXRAY_MANAGED=true\n`;
      await this.writeEnv(conn, envContent, dto);

      const install = await this.runRemoteCommand(
        conn,
        `cd ${REMOTE_DIR} && ${sudo}bash install.sh --mode node --yes`,
      );
      if (install.code !== 0) {
        throw new BadRequestException('Remote agent installation failed');
      }
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
