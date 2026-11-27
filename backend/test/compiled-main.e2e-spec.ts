// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { existsSync } from 'fs';
import { join } from 'path';

const mockUse = jest.fn();
const mockCreate = jest.fn().mockResolvedValue({
  use: mockUse,
  set: jest.fn(),
  enableCors: jest.fn(),
  useGlobalPipes: jest.fn(),
  setGlobalPrefix: jest.fn(),
  listen: jest.fn().mockResolvedValue(undefined),
});

jest.mock('@nestjs/core', () => ({
  ...jest.requireActual('@nestjs/core'),
  NestFactory: { create: mockCreate },
}));

const mockBuilder: Record<string, jest.Mock> = {};
for (const method of ['setTitle', 'setDescription', 'setVersion', 'addBearerAuth']) {
  mockBuilder[method] = jest.fn(() => mockBuilder);
}
mockBuilder.build = jest.fn(() => ({}));

jest.mock('@nestjs/swagger', () => ({
  ...jest.requireActual('@nestjs/swagger'),
  DocumentBuilder: jest.fn(() => mockBuilder),
  SwaggerModule: {
    createDocument: jest.fn(() => ({})),
    setup: jest.fn(),
  },
}));

jest.mock('../dist/app.module', () => ({ AppModule: class {} }));

describe('compiled backend entrypoint (smoke)', () => {
  it('loads dist/main.js and registers both global middleware functions', async () => {
    const mainPath = join(__dirname, '..', 'dist', 'main.js');
    expect(existsSync(mainPath)).toBe(true);

    jest.resetModules();
    require(mainPath);
    await new Promise((resolve) => setImmediate(resolve));

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockUse).toHaveBeenCalledTimes(2);
    expect(typeof mockUse.mock.calls[0][0]).toBe('function');
    expect(typeof mockUse.mock.calls[1][0]).toBe('function');
  });
});
