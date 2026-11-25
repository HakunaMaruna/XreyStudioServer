import { SetMetadata } from '@nestjs/common';

export const SNAPSHOT_BEFORE_KEY = 'xss.snapshot-before';

export type SnapshotTriggerKind = 'update' | 'settings';

export interface SnapshotBeforeMetadata {
  kind: SnapshotTriggerKind;
  reason: string;
}

export function SnapshotBefore(kind: SnapshotTriggerKind, reason: string) {
  return SetMetadata(SNAPSHOT_BEFORE_KEY, { kind, reason } satisfies SnapshotBeforeMetadata);
}
