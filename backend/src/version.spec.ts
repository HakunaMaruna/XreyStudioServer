// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { isAgentOutdated, MIN_AGENT_VERSION } from './version';

describe('isAgentOutdated', () => {
  it('does not flag agents from newer panel-only releases', () => {
    expect(isAgentOutdated('2.54.2')).toBe(false);
    expect(isAgentOutdated('2.54.3')).toBe(false);
  });

  it('flags agents below the minimum compatible version', () => {
    expect(isAgentOutdated('2.48.7')).toBe(true);
  });

  it('ignores empty versions and rejects malformed ones', () => {
    expect(isAgentOutdated(null)).toBe(false);
    expect(isAgentOutdated('garbage')).toBe(true);
    expect(MIN_AGENT_VERSION).toBe('2.50.5');
  });
});
