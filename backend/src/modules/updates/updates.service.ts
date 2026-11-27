// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { verify } from 'crypto';
import { APP_VERSION, isAgentOutdated } from '../../version';
import { PrismaService } from '../../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { VerifyUpdateDto } from './dto/verify-update.dto';

export type UpdateChannel = 'stable' | 'dev';

export type ReleaseInfo = {
  version: string;
  url: string | null;
  notes: string | null;
  publishedAt: string | null;
};

export type UpdateJob = {
  running: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  exitCode: number | null;
  logTail: string;
};

export type UpdateStatus = {
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  channel: UpdateChannel;
  releaseUrl: string | null;
  releaseNotes: string | null;
  publishedAt: string | null;
  checkedAt: string | null;
  checkEnabled: boolean;
  source: 'github' | 'custom' | 'disabled';
  canApply: boolean;
  error: string | null;
  apply: { mode: 'auto' | 'manual'; command: string };
  agents: { total: number; outdated: number; unknown: number };
  job: UpdateJob | null;
};

const CACHE_TTL_SECONDS = Number(process.env.UPDATE_CHECK_TTL_SECONDS || 900);
const RAW_TIMEOUT = Number(process.env.UPDATE_CHECK_TIMEOUT_MS);
const REQUEST_TIMEOUT_MS = Number.isFinite(RAW_TIMEOUT) && RAW_TIMEOUT >= 1000 ? RAW_TIMEOUT : 5000;
const NOTES_LIMIT = 4000;
const MANUAL_COMMAND_DEFAULT = 'make update';
const DEFAULT_REPO = 'HakunaMaruna/XreyStudioServer';

export function normalizeVersion(value: string | null | undefined): string | null {
  const trimmed = String(value || '').trim().replace(/^v/i, '');
  return /^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.]+)?$/.test(trimmed) ? trimmed : null;
}

/** Only http(s) links are safe to render in the admin UI. */
export function safeHttpUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!/^https?:\/\//i.test(trimmed)) return null;
  try {
    const url = new URL(trimmed);
    return url.hostname ? trimmed : null;
  } catch {
    return null;
  }
}

function parseVersionParts(value: string): { release: number[]; pre: string[] } {
  const [core, ...rest] = String(value || '').trim().replace(/^v/i, '').split('+')[0].split('-');
  const release = core.split('.').map((part) => {
    const numeric = Number(part);
    return Number.isFinite(numeric) ? numeric : 0;
  });
  return { release, pre: rest.join('-').split('.').filter(Boolean) };
}

// Semver-сравнение: числовые части по значению, пре-релиз всегда старше релиза.
export function compareVersions(a: string, b: string): number {
  const left = parseVersionParts(a);
  const right = parseVersionParts(b);
  const length = Math.max(left.release.length, right.release.length);
  for (let i = 0; i < length; i += 1) {
    const l = left.release[i] ?? 0;
    const r = right.release[i] ?? 0;
    if (l !== r) return l > r ? 1 : -1;
  }
  if (!left.pre.length && !right.pre.length) return 0;
  if (!left.pre.length) return 1; // 2.33.0 > 2.33.0-rc.1
  if (!right.pre.length) return -1;
  const preLength = Math.max(left.pre.length, right.pre.length);
  for (let i = 0; i < preLength; i += 1) {
    const l = left.pre[i];
    const r = right.pre[i];
    if (l === undefined) return -1;
    if (r === undefined) return 1;
    const lNumeric = /^\d+$/.test(l);
    const rNumeric = /^\d+$/.test(r);
    if (lNumeric && rNumeric) {
      const ln = Number(l);
      const rn = Number(r);
      if (ln !== rn) return ln > rn ? 1 : -1;
      continue;
    }
    if (lNumeric !== rNumeric) return lNumeric ? -1 : 1;
    if (l !== r) return l > r ? 1 : -1;
  }
  return 0;
}

export function isNewerVersion(candidate: string, current: string): boolean {
  const next = normalizeVersion(candidate);
  const cur = normalizeVersion(current);
  if (!next || !cur) return false;
  return compareVersions(next, cur) > 0;
}

export function parseGithubRelease(body: any): ReleaseInfo | null {
  if (!body || typeof body !== 'object') return null;
  const version = normalizeVersion(body.tag_name || body.name);
  if (!version) return null;
  const notes = typeof body.body === 'string' ? body.body.slice(0, NOTES_LIMIT) : null;
  return {
    version,
    url: safeHttpUrl(body.html_url),
    notes,
    publishedAt: typeof body.published_at === 'string' ? body.published_at : null,
  };
}

function parsePublicKey(raw: string | undefined): string | null {
  if (!raw) return null;
  const value = raw.trim();
  if (value.startsWith('-----BEGIN PUBLIC KEY-----')) return value;
  try {
    const decoded = Buffer.from(value, 'base64').toString('utf8');
    return decoded.startsWith('-----BEGIN PUBLIC KEY-----') ? decoded : null;
  } catch {
    return null;
  }
}

@Injectable()
export class UpdatesService {
  private readonly logger = new Logger(UpdatesService.name);
  private cache: {
    at: number;
    channel: UpdateChannel;
    release: ReleaseInfo | null;
    error: string | null;
    source: 'github' | 'custom';
  } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  private publicKey(): string {
    const key = parsePublicKey(process.env.UPDATE_PUBLIC_KEY);
    if (!key) throw new ServiceUnavailableException('UPDATE_PUBLIC_KEY is not configured');
    return key;
  }

  verify(dto: VerifyUpdateDto): { valid: boolean; version?: string } {
    const bundle = Buffer.from(dto.bundleBase64, 'base64');
    const signature = Buffer.from(dto.signatureBase64, 'base64');
    if (bundle.length === 0 || bundle.length > 80 * 1024 * 1024) {
      throw new BadRequestException('bundle size is out of range');
    }
    if (signature.length === 0 || signature.length > 4096) {
      throw new BadRequestException('signature size is out of range');
    }

    const publicKey = this.publicKey();
    const valid = this.verifySignature(bundle, signature, publicKey);
    return dto.version ? { valid, version: dto.version } : { valid };
  }

  private verifySignature(bundle: Buffer, signature: Buffer, publicKey: string): boolean {
    try {
      return verify(null, bundle, publicKey, signature);
    } catch (error) {
      // Malformed signatures are an invalid result, not a server failure.
      // Their contents are never logged or echoed back to the caller.
      void error;
      return false;
    }
  }

  private updater(): { url: string; token: string } | null {
    const raw = process.env.UPDATER_URL || '';
    const token = process.env.UPDATER_TOKEN || '';
    const url = safeHttpUrl(raw)?.replace(/\/$/, '') || '';
    if (!url) {
      if (raw) this.logger.warn('UPDATER_URL is not a valid http(s) URL; auto updates disabled');
      return null;
    }
    return token ? { url, token } : null;
  }

  private async request(url: string, init: RequestInit = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  private async fetchRelease(channel: UpdateChannel): Promise<{
    release: ReleaseInfo | null;
    source: 'github' | 'custom';
  }> {
    const customUrl = safeHttpUrl(process.env.UPDATE_CHECK_URL);
    if (process.env.UPDATE_CHECK_URL && !customUrl) {
      throw new Error('UPDATE_CHECK_URL must be a valid http(s) URL');
    }
    if (customUrl) {
      const response = await this.request(customUrl, { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`update endpoint responded ${response.status}`);
      const body = await response.json();
      const release = parseGithubRelease({
        tag_name: body.version || body.tag_name,
        html_url: safeHttpUrl(body.url || body.html_url),
        body: body.notes || body.body,
        published_at: body.publishedAt || body.published_at,
      });
      if (!release) throw new Error('update endpoint returned no version');
      return { release, source: 'custom' };
    }

    const repo = process.env.UPDATE_REPO || DEFAULT_REPO;
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) {
      throw new Error('UPDATE_REPO must be in owner/repo format');
    }
    const base = safeHttpUrl(process.env.UPDATE_CHECK_BASE_URL || 'https://api.github.com');
    if (!base) throw new Error('UPDATE_CHECK_BASE_URL must be a valid http(s) URL');
    const path = channel === 'dev'
      ? `/repos/${repo}/releases?per_page=10`
      : `/repos/${repo}/releases/latest`;
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'User-Agent': `xrey-studio/${APP_VERSION}`,
    };
    if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    const response = await this.request(`${base.replace(/\/$/, '')}${path}`, { headers });
    if (!response.ok) throw new Error(`GitHub responded ${response.status}`);
    const body = await response.json();
    if (channel === 'dev') {
      const list = Array.isArray(body) ? body : [];
      const releases = list
        .filter((item) => item && !item.draft)
        .map((item) => parseGithubRelease(item))
        .filter((release): release is ReleaseInfo => Boolean(release))
        .sort((a, b) => compareVersions(b.version, a.version));
      return { release: releases[0] || null, source: 'github' };
    }
    return { release: parseGithubRelease(body), source: 'github' };
  }

  private async latestRelease(channel: UpdateChannel, force: boolean) {
    const ttl = Number.isFinite(CACHE_TTL_SECONDS) ? Math.max(60, CACHE_TTL_SECONDS) : 900;
    const fresh = this.cache && this.cache.channel === channel && Date.now() - this.cache.at < ttl * 1000;
    if (fresh && !force) return this.cache;
    try {
      const { release, source } = await this.fetchRelease(channel);
      this.cache = { at: Date.now(), channel, release, error: null, source };
    } catch (error: any) {
      // Keep the last successful answer; a transient network failure must not hide the update.
      const message = String(error?.message || 'update check failed').slice(0, 300);
      this.logger.warn(`Update check failed: ${message}`);
      const previous = this.cache?.channel === channel ? this.cache : null;
      this.cache = {
        at: previous?.at ?? Date.now(),
        channel,
        release: previous?.release ?? null,
        error: message,
        source: previous?.source ?? 'github',
      };
    }
    return this.cache;
  }

  private manualCommand() {
    return (process.env.UPDATE_MANUAL_COMMAND || MANUAL_COMMAND_DEFAULT).trim();
  }

  private async agents() {
    const nodes = await this.prisma.node.findMany({ select: { agentVersion: true } });
    return {
      total: nodes.length,
      outdated: nodes.filter((node) => isAgentOutdated(node.agentVersion)).length,
      unknown: nodes.filter((node) => !node.agentVersion).length,
    };
  }

  // Заодно проверяем, что сайдкар действительно отвечает: если профиль updater
  // не запущен, панель должна показывать ручную команду, а не битую кнопку.
  private async jobInfo(): Promise<{ job: UpdateJob | null; reachable: boolean }> {
    const updater = this.updater();
    if (!updater) return { job: null, reachable: false };
    try {
      const response = await this.request(`${updater.url}/status`, {
        headers: { 'X-Updater-Token': updater.token },
      }, 2000);
      if (!response.ok) return { job: null, reachable: false };
      const body = await response.json();
      return {
        reachable: true,
        job: {
          running: Boolean(body.running),
          startedAt: body.startedAt || null,
          finishedAt: body.finishedAt || null,
          exitCode: body.exitCode ?? null,
          logTail: typeof body.logTail === 'string' ? body.logTail.slice(-4000) : '',
        },
      };
    } catch {
      return { job: null, reachable: false };
    }
  }

  async status(force = false, canApply = false): Promise<UpdateStatus> {
    const settings = await this.settings.get();
    const channel: UpdateChannel = settings.updateChannel === 'dev' ? 'dev' : 'stable';
    const checkEnabled = settings.updateCheckEnabled !== false;
    const agents = await this.agents();
    const { job, reachable } = await this.jobInfo();
    const base = {
      currentVersion: APP_VERSION,
      channel,
      canApply,
      apply: {
        mode: reachable ? ('auto' as const) : ('manual' as const),
        command: this.manualCommand(),
      },
      agents,
      job,
    };

    if (!checkEnabled) {
      return {
        ...base,
        latestVersion: null,
        updateAvailable: false,
        releaseUrl: null,
        releaseNotes: null,
        publishedAt: null,
        checkedAt: null,
        checkEnabled: false,
        source: 'disabled',
        error: null,
      };
    }

    const cache = await this.latestRelease(channel, force);
    const release = cache?.release || null;
    return {
      ...base,
      latestVersion: release?.version || null,
      updateAvailable: release ? isNewerVersion(release.version, APP_VERSION) : false,
      releaseUrl: release?.url || null,
      releaseNotes: release?.notes || null,
      publishedAt: release?.publishedAt || null,
      checkedAt: cache ? new Date(cache.at).toISOString() : null,
      checkEnabled: true,
      source: cache?.source || 'github',
      error: cache?.error || null,
    };
  }

  async apply(targetVersion?: string) {
    const updater = this.updater();
    if (!updater) {
      throw new ServiceUnavailableException(
        `Automatic updates are disabled. Run "${this.manualCommand()}" on the host.`,
      );
    }
    const version = normalizeVersion(targetVersion);
    if (targetVersion && !version) throw new BadRequestException('Invalid target version');
    let response: Response;
    try {
      response = await this.request(`${updater.url}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Updater-Token': updater.token },
        body: JSON.stringify({ targetVersion: version }),
      }, 10_000);
    } catch (error: any) {
      throw new ServiceUnavailableException(`Updater is unreachable: ${String(error?.message || error)}`);
    }
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300);
      throw new ServiceUnavailableException(`Updater rejected the request (${response.status}): ${detail}`);
    }
    const body = await response.json().catch(() => ({}));
    return { started: body.started !== false, targetVersion: version, job: (await this.jobInfo()).job };
  }
}
