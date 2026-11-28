// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import {
  Body, Controller, Get, Headers, Param, Post, Query, Res,
} from '@nestjs/common';
import { StorePluginStatus } from '@prisma/client';
import { StoreService } from './store.service';

@Controller()
export class StoreController {
  constructor(private readonly service: StoreService) {}

  @Get('moderation')
  async moderationPage(@Res() res: any) {
    const plugins = await this.service.adminList();
    const rows = plugins.map((plugin) => `<tr><td>${escapeHtml(plugin.slug)}</td><td>${escapeHtml(plugin.name)}</td><td>${escapeHtml(plugin.status)}</td><td><select id="s-${escapeHtml(plugin.slug)}"><option>DRAFT</option><option>REVIEW</option><option>PUBLISHED</option><option>SUSPENDED</option></select></td><td><button onclick="setStatus('${escapeHtml(plugin.slug)}')">Save</button></td></tr>`).join('');
    res.type('html').send(`<!doctype html><html><head><meta charset="utf-8"><title>Store moderation</title><style>body{font:14px system-ui;background:#0a0d16;color:#eee;padding:24px}input,select,button{background:#151d33;color:#eee;border:1px solid #3a4a6b;border-radius:8px;padding:8px}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #263149;padding:8px;text-align:left}</style></head><body><h1>Store moderation</h1><p>Admin token: <input id="token" type="password" placeholder="STORE_ADMIN_TOKEN"></p><table><tr><th>Slug</th><th>Name</th><th>Status</th><th>New</th><th></th></tr>${rows}</table><script>async function setStatus(slug){const t=document.getElementById('token').value;const status=document.getElementById('s-'+slug).value;const r=await fetch('/api/store/status/'+encodeURIComponent(slug),{method:'POST',headers:{'Content-Type':'application/json','X-Store-Token':t},body:JSON.stringify({status})});alert(r.ok?'saved':'error '+r.status);}</script></body></html>`);
  }

  @Get('/')
  async catalogPage(@Res() res: any) {
    const data = await this.service.list({});
    const cards = data.plugins.map((plugin) => `<article class="card"><h2>${escapeHtml(plugin.name)}</h2><p>${escapeHtml(plugin.description)}</p><p class="meta">${escapeHtml(plugin.author)} · ${escapeHtml(plugin.latestVersion || '—')}</p></article>`).join('');
    res.type('html').send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>App Store</title><style>body{margin:0;background:#080b14;color:#f2f5ff;font:15px system-ui;padding:24px}h1{margin:0 0 24px}.grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fill,minmax(260px,1fr))}.card{border:1px solid #263149;background:#0f1526;border-radius:16px;padding:18px}.meta{color:#94a2bd;font-size:12px}a{color:#8b7cff}</style></head><body><h1>App Store</h1><div class="grid">${cards || '<p>No published plugins</p>'}</div></body></html>`);
  }

  @Get('api/store/plugins')
  list(@Query() query: { search?: string; category?: string }) { return this.service.list(query); }

  @Get('api/store/plugins/:slug')
  details(@Param('slug') slug: string) { return this.service.details(slug); }

  @Get('api/store/versions/:id/download')
  download(@Param('id') id: string) { return this.service.download(id); }

  @Post('api/store/check-updates')
  checkUpdates(@Body() body: { versions: Record<string, string> }) { return this.service.checkUpdates(body.versions || {}); }

  @Post('api/store/publish')
  publish(@Body() body: any, @Headers('x-store-token') token?: string) { return this.service.publish(body, token); }

  @Post('api/store/status/:slug')
  setStatus(@Param('slug') slug: string, @Body() body: { status: StorePluginStatus }, @Headers('x-store-token') token?: string) {
    return this.service.setStatus(slug, body.status, token);
  }

  @Post('api/store/revoke/:slug')
  revoke(@Param('slug') slug: string, @Body() body: { version?: string; reason?: string }, @Headers('x-store-token') token?: string) {
    return this.service.revoke(slug, body.version || null, body.reason || null, token);
  }

  @Get('api/store/reviews')
  reviews(@Headers('x-store-token') token?: string) { return this.service.reviews(token); }

  @Post('api/store/reviews')
  createReview(@Body() body: any, @Headers('x-store-token') token?: string) { return this.service.createReview(body, token); }

  @Post('api/store/reviews/:id/decide')
  decideReview(@Param('id') id: string, @Body() body: any, @Headers('x-store-token') token?: string) {
    return this.service.decideReview(id, body, token);
  }

  @Get('api/store/revocations')
  revocations() { return this.service.revocations(); }
}

function escapeHtml(value: string) {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] || char));
}
