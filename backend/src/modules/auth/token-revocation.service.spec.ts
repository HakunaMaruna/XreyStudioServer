// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { TokenRevocationService } from './token-revocation.service';

describe('TokenRevocationService', () => {
  it('marks a JTI as revoked until its expiry', async () => {
    const service = new TokenRevocationService();
    await service.revoke('jti-1', Date.now() + 60_000);
    expect(await service.isRevoked('jti-1')).toBe(true);
    expect(await service.isRevoked('jti-2')).toBe(false);
    service.onModuleDestroy();
  });
});
