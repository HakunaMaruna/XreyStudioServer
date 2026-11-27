// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { APP_VERSION } from './version';

(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  // The panel runs behind Caddy on a private Docker network. Trusting only
  // private proxies restores per-client IPs for throttling and audit logs while
  // a direct public connection cannot spoof X-Forwarded-For.
  app.set('trust proxy', 'uniquelocal');
  app.use(helmet());
  app.use(cookieParser());
  // Panel credentials travel in the Authorization header, so cross-origin access
  // must be an explicit allow-list. A wildcard is never combined with credentials.
  const configuredOrigins = (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((value) => value.trim().replace(/\/$/, ''))
    .filter(Boolean);
  const developmentOrigins = [/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/];
  app.enableCors({
    origin: configuredOrigins.length
      ? configuredOrigins
      : process.env.NODE_ENV === 'production'
        ? false
        : developmentOrigins,
    credentials: true,
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.setGlobalPrefix('api');

  const config = new DocumentBuilder()
    .setTitle('XreyStudioServer API')
    .setDescription('Xray Control Panel API')
    .setVersion(APP_VERSION)
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  await app.listen(process.env.PORT || 3000);
}
bootstrap();
