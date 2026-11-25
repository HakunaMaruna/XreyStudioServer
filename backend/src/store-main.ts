import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { StoreModule } from './modules/store/store.module';

async function bootstrap() {
  const app = await NestFactory.create(StoreModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors({ origin: process.env.STORE_CORS_ORIGIN || '*' });
  await app.listen(Number(process.env.STORE_PORT || 3012));
}
bootstrap();
