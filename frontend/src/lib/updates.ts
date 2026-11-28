// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
'use client';
import { api } from './api';

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
  channel: 'stable' | 'dev';
  releaseUrl: string | null;
  releaseNotes: string | null;
  publishedAt: string | null;
  checkedAt: string | null;
  checkEnabled: boolean;
  source: 'github' | 'custom' | 'disabled';
  canApply: boolean;
  error: string | null;
  apply: { mode: 'auto' | 'manual'; command: string };
  agents: { total: number; outdated: number; updateAvailable?: number; unknown: number };
  job: UpdateJob | null;
};

export function fetchUpdateStatus(force = false) {
  return force
    ? api.post<UpdateStatus>('/api/updates/check', {})
    : api.get<UpdateStatus>('/api/updates/status');
}

export function applyPanelUpdate(targetVersion?: string | null) {
  return api.post<{ started: boolean; targetVersion: string | null; job: UpdateJob | null }>(
    '/api/updates/apply',
    targetVersion ? { targetVersion } : {},
  );
}
