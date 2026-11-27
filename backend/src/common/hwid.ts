// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { BadRequestException } from '@nestjs/common';

const HWID_PATTERN = /^[A-Za-z0-9_.:-]{8,128}$/;

/** Validate an external HWID before using it in a database lookup or upsert. */
export function normalizeHwid(hwid: unknown): string | undefined {
  if (hwid === undefined || hwid === null || hwid === '') return undefined;
  if (typeof hwid !== 'string' || !HWID_PATTERN.test(hwid)) {
    throw new BadRequestException('Invalid hwid: expected 8-128 chars [A-Za-z0-9_.:-]');
  }
  return hwid;
}
