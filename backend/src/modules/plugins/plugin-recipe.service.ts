// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/** Shape a plugin may pass to `sdk.recipes.register()`. */
export interface PluginRecipeInput {
  id: string;
  name: string;
  description?: string;
  protocol?: string;
  transport?: string;
  security?: string;
  port?: number;
  flow?: string;
  path?: string;
  sni?: string;
  settings?: Record<string, unknown>;
  generateKeys?: boolean;
}

/** Flat recipe consumed by the inbound recipes endpoint. */
export interface InboundPluginRecipe {
  id: string;
  name: string;
  description: string;
  source: 'plugin';
  pluginId: string;
  protocol: string;
  transport: string;
  security: string;
  port: number | null;
  flow: string;
  path: string;
  sni: string;
  settings: Record<string, unknown>;
  generateKeys: boolean;
}

const PLUGIN_ID_RE = /^[a-z0-9]+(\.[a-z0-9-]+)+$/;
const RECIPE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const MAX_NAME_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 1000;
const MAX_TEXT_LENGTH = 256;
const MAX_SETTINGS_BYTES = 16 * 1024;
const MAX_SETTINGS_KEYS = 100;
const MAX_RECIPES_PER_PLUGIN = 50;
const MAX_LISTED_RECIPES = 500;

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

@Injectable()
export class PluginRecipeService {
  constructor(private readonly prisma: PrismaService) {}

  private assertPluginId(pluginId: string): string {
    if (typeof pluginId !== 'string' || !PLUGIN_ID_RE.test(pluginId)) {
      throw new BadRequestException('Invalid plugin id');
    }
    return pluginId;
  }

  private text(value: unknown, field: string, max: number, required = false): string | undefined {
    if (value === undefined || value === null) {
      if (required) throw new BadRequestException(`Plugin recipe ${field} is required`);
      return undefined;
    }
    if (typeof value !== 'string' || value.length > max || (required && !value.trim())) {
      throw new BadRequestException(`Invalid plugin recipe ${field}`);
    }
    return value;
  }

  /** Validate and normalize untrusted plugin data. Never includes payload values in errors or logs. */
  private normalize(recipe: unknown): PluginRecipeInput {
    if (!isPlainObject(recipe)) throw new BadRequestException('Plugin recipe must be an object');

    const id = this.text(recipe.id, 'id', 64, true);
    if (!RECIPE_ID_RE.test(id as string)) throw new BadRequestException('Invalid plugin recipe id');
    const name = this.text(recipe.name, 'name', MAX_NAME_LENGTH, true);

    const value: PluginRecipeInput = { id: id as string, name: name as string };
    const description = this.text(recipe.description, 'description', MAX_DESCRIPTION_LENGTH);
    const protocol = this.text(recipe.protocol, 'protocol', MAX_TEXT_LENGTH);
    const transport = this.text(recipe.transport, 'transport', MAX_TEXT_LENGTH);
    const security = this.text(recipe.security, 'security', MAX_TEXT_LENGTH);
    const flow = this.text(recipe.flow, 'flow', MAX_TEXT_LENGTH);
    const path = this.text(recipe.path, 'path', MAX_TEXT_LENGTH);
    const sni = this.text(recipe.sni, 'sni', MAX_TEXT_LENGTH);
    if (description !== undefined) value.description = description;
    if (protocol !== undefined) value.protocol = protocol;
    if (transport !== undefined) value.transport = transport;
    if (security !== undefined) value.security = security;
    if (flow !== undefined) value.flow = flow;
    if (path !== undefined) value.path = path;
    if (sni !== undefined) value.sni = sni;

    if (recipe.port !== undefined && recipe.port !== null) {
      if (typeof recipe.port !== 'number' || !Number.isInteger(recipe.port) ||
          recipe.port < 1 || recipe.port > 65535) {
        throw new BadRequestException('Invalid plugin recipe port');
      }
      value.port = recipe.port;
    }

    if (recipe.settings !== undefined && recipe.settings !== null) {
      if (!isPlainObject(recipe.settings) || Object.keys(recipe.settings).length > MAX_SETTINGS_KEYS) {
        throw new BadRequestException('Plugin recipe settings must be an object');
      }
      let bytes: number;
      try {
        bytes = Buffer.byteLength(JSON.stringify(recipe.settings), 'utf8');
      } catch {
        throw new BadRequestException('Invalid plugin recipe settings');
      }
      if (!bytes || bytes > MAX_SETTINGS_BYTES) throw new BadRequestException('Plugin recipe settings are too large');
      value.settings = recipe.settings;
    }

    if (recipe.generateKeys !== undefined) {
      if (typeof recipe.generateKeys !== 'boolean') throw new BadRequestException('Invalid plugin recipe generateKeys');
      value.generateKeys = recipe.generateKeys;
    }

    return value;
  }

  /** Upsert a recipe registered by a plugin. Rows are always scoped to the calling plugin. */
  async register(pluginId: string, recipe: unknown): Promise<{ recipeId: string }> {
    const owner = this.assertPluginId(pluginId);
    const value = this.normalize(recipe);
    // Exclude the recipe being updated so re-registering is not blocked by the cap.
    const count = await this.prisma.pluginRecipe.count({
      where: { pluginId: owner, recipeId: { not: value.id } },
    });
    if (count >= MAX_RECIPES_PER_PLUGIN) throw new BadRequestException('Plugin recipe limit reached');
    await this.prisma.pluginRecipe.upsert({
      where: { pluginId_recipeId: { pluginId: owner, recipeId: value.id } },
      create: {
        id: `${owner}:${value.id}`,
        pluginId: owner,
        recipeId: value.id,
        payload: value as any,
      },
      update: { payload: value as any },
    });
    return { recipeId: value.id };
  }

  /** Remove a recipe; a plugin can never unregister another plugin's recipe. */
  async unregister(pluginId: string, recipeId: unknown): Promise<{ removed: boolean }> {
    const owner = this.assertPluginId(pluginId);
    if (typeof recipeId !== 'string' || !RECIPE_ID_RE.test(recipeId)) {
      throw new BadRequestException('Invalid plugin recipe id');
    }
    await this.prisma.pluginRecipe.deleteMany({ where: { pluginId: owner, recipeId } });
    return { removed: true };
  }

  /** Cleanup hook for plugin uninstall/quarantine paths. */
  async removeAll(pluginId: string): Promise<void> {
    await this.prisma.pluginRecipe.deleteMany({ where: { pluginId: this.assertPluginId(pluginId) } });
  }

  private toInboundRecipe(row: { pluginId: string; recipeId: string; payload: unknown }): InboundPluginRecipe {
    const raw = isPlainObject(row.payload) ? row.payload : {};
    const stringField = (key: string) => typeof raw[key] === 'string' ? raw[key] as string : '';
    const port = typeof raw.port === 'number' && Number.isInteger(raw.port) && raw.port >= 1 && raw.port <= 65535
      ? raw.port : null;
    return {
      id: row.recipeId,
      name: stringField('name') || row.recipeId,
      description: stringField('description'),
      source: 'plugin',
      pluginId: row.pluginId,
      protocol: stringField('protocol'),
      transport: stringField('transport') || 'tcp',
      security: stringField('security') || 'none',
      port,
      flow: stringField('flow'),
      path: stringField('path'),
      sni: stringField('sni'),
      settings: isPlainObject(raw.settings) ? raw.settings : {},
      generateKeys: raw.generateKeys === true,
    };
  }

  /** All plugin recipes, flattened for the inbound recipes endpoint. */
  async listForInbounds(): Promise<InboundPluginRecipe[]> {
    const rows = await this.prisma.pluginRecipe.findMany({
      orderBy: [{ pluginId: 'asc' }, { recipeId: 'asc' }],
      take: MAX_LISTED_RECIPES,
    });
    return rows.map((row: any) => this.toInboundRecipe(row));
  }
}
