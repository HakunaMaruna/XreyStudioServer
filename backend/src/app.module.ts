import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { getStorageToken, ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.service';
import { PasswordModule } from './common/password.module';
import { SeedService } from './common/seed.service';
import { RedisThrottlerStorage } from './common/redis-throttler.storage';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { NodesModule } from './modules/nodes/nodes.module';
import { HealthModule } from './modules/health/health.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { AuditModule } from './modules/audit/audit.module';
import { InboundsModule } from './modules/inbounds/inbounds.module';
import { HostsModule } from './modules/hosts/hosts.module';
import { RulesModule } from './modules/rules/rules.module';
import { ConfigModule as XrayConfigModule } from './modules/config/config.module';
import { MetricsModule } from './modules/metrics/metrics.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { BackupsModule } from './modules/backups/backups.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([
      {
        ttl: Number(process.env.THROTTLE_TTL ?? 60_000),
        limit: Number(process.env.THROTTLE_LIMIT ?? 120),
      },
    ]),
    PrismaModule,
    PasswordModule,
    AuthModule,
    UsersModule,
    NodesModule,
    HealthModule,
    SubscriptionsModule,
    AuditModule,
    InboundsModule,
    HostsModule,
    RulesModule,
    XrayConfigModule,
    MetricsModule,
    NotificationsModule,
    PaymentsModule,
    OrganizationsModule,
    BackupsModule,
  ],
  providers: [
    SeedService,
    { provide: getStorageToken(), useClass: RedisThrottlerStorage },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
