// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { CallHandler, ExecutionContext } from '@nestjs/common';
import { firstValueFrom, of } from 'rxjs';
import { SnapshotBeforeInterceptor } from './snapshot-before.interceptor';

const context = (method: string): ExecutionContext => ({
  getHandler: () => () => undefined,
  getClass: () => class {},
  switchToHttp: () => ({ getRequest: () => ({ method, user: { userId: 'user-1' } }) }),
} as unknown as ExecutionContext);

describe('SnapshotBeforeInterceptor', () => {
  const reflector = { getAllAndOverride: jest.fn() };
  const snapshots = { beforeChange: jest.fn(async () => undefined) };
  const interceptor = new SnapshotBeforeInterceptor(reflector as any, snapshots as any);
  const next: CallHandler = { handle: () => of('ok') };

  beforeEach(() => {
    snapshots.beforeChange.mockClear();
    reflector.getAllAndOverride.mockReset();
  });

  it('creates an automatic snapshot before a mutating update', async () => {
    reflector.getAllAndOverride.mockReturnValue({ kind: 'update', reason: 'Node configuration apply' });
    await expect(firstValueFrom(await interceptor.intercept(context('POST'), next))).resolves.toBe('ok');
    expect(snapshots.beforeChange).toHaveBeenCalledWith('update', 'Node configuration apply', 'user-1');
  });

  it('does not snapshot read-only requests', async () => {
    reflector.getAllAndOverride.mockReturnValue({ kind: 'update', reason: 'Node configuration apply' });
    await expect(firstValueFrom(await interceptor.intercept(context('GET'), next))).resolves.toBe('ok');
    expect(snapshots.beforeChange).not.toHaveBeenCalled();
  });

  it('passes through when no metadata is present', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    await expect(firstValueFrom(await interceptor.intercept(context('DELETE'), next))).resolves.toBe('ok');
    expect(snapshots.beforeChange).not.toHaveBeenCalled();
  });
});
