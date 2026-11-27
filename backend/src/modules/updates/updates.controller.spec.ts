// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { SNAPSHOT_BEFORE_KEY } from '../snapshots/snapshot-before.decorator';
import { UpdatesController } from './updates.controller';

describe('UpdatesController automatic snapshot', () => {
  it('creates a pre-update snapshot before applying a panel update', () => {
    expect(Reflect.getMetadata(SNAPSHOT_BEFORE_KEY, UpdatesController.prototype.apply)).toMatchObject({
      kind: 'update',
      reason: 'Panel update apply',
    });
  });
});
