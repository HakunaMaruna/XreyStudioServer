// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { SNAPSHOT_BEFORE_KEY } from '../snapshots/snapshot-before.decorator';
import { NodesController } from './nodes.controller';

describe('NodesController automatic snapshots', () => {
  it('creates a pre-update snapshot before applying or rolling back config', () => {
    expect(Reflect.getMetadata(SNAPSHOT_BEFORE_KEY, NodesController.prototype.apply)).toMatchObject({
      kind: 'update',
      reason: 'Node configuration apply',
    });
    expect(Reflect.getMetadata(SNAPSHOT_BEFORE_KEY, NodesController.prototype.rollback)).toMatchObject({
      kind: 'update',
      reason: 'Node configuration rollback',
    });
  });
});
