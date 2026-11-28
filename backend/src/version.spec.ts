// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { APP_VERSION, isAgentOutdated, isAgentUpdateAvailable, MIN_AGENT_VERSION } from './version';

describe('isAgentOutdated', () => {
  it('does not flag agents from newer panel-only releases', () => {
    expect(isAgentOutdated(MIN_AGENT_VERSION)).toBe(false);
    expect(isAgentOutdated('99.0.0')).toBe(false);
  });

  it('flags agents below the minimum compatible version', () => {
    expect(isAgentOutdated('2.48.7')).toBe(true);
    expect(isAgentOutdated('2.54.2')).toBe(true);
  });

  it('ignores empty versions and rejects malformed ones', () => {
    expect(isAgentOutdated(null)).toBe(false);
    expect(isAgentOutdated('garbage')).toBe(true);
  });
});

describe('isAgentUpdateAvailable', () => {
  it('offers an update when the agent is behind the panel', () => {
    expect(isAgentUpdateAvailable('2.0.0')).toBe(true);
    expect(isAgentUpdateAvailable(APP_VERSION)).toBe(false);
    expect(isAgentUpdateAvailable(null)).toBe(false);
  });
});
