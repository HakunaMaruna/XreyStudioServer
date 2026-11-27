// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { PermissionsGuard } from './permissions.guard';

describe('PermissionsGuard', () => {
  const makeGuard = (permission: string | undefined, permissions: string[]) => {
    const reflector: any = { getAllAndOverride: jest.fn(() => permission) };
    const groups: any = { permissionsOf: jest.fn(async () => permissions) };
    const guard = new PermissionsGuard(reflector, groups);
    const context: any = {
      switchToHttp: () => ({ getRequest: () => ({ user: { userId: 'u1', role: 'OPERATOR' } }) }),
      getHandler: () => null,
      getClass: () => null,
    };
    return { guard, context };
  };

  it('allows admins and legacy users without groups', async () => {
    expect(await makeGuard('inbounds.create', []).guard.canActivate(makeGuard('inbounds.create', []).context)).toBe(true);
  });

  it('allows group members with the required permission', async () => {
    const { guard, context } = makeGuard('inbounds.create', ['inbounds.create']);
    expect(await guard.canActivate(context)).toBe(true);
  });

  it('denies group members without the required permission', async () => {
    const { guard, context } = makeGuard('inbounds.create', ['users.view']);
    expect(await guard.canActivate(context)).toBe(false);
  });

  it('skips checks when no permission is required', async () => {
    const { guard, context } = makeGuard(undefined, []);
    expect(await guard.canActivate(context)).toBe(true);
  });
});
