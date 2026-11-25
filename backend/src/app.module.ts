import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.service';
import { PasswordModule } from './common/password.module';
import { RedisThrottlerStorage } from './common/redis-throttler.storage';
import { SeedService } from './common/seed.service';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { NodesModule } from './modules/nodes/nodes.module';
import { NodeProvisionModule } from './modules/node-provision/node-provision.module';
import { HealthModule } from './modules/health/health.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { AuditModule } from './modules/audit/audit.module';
import { InboundsModule } from './modules/inbounds/inbounds.module';
import { HostsModule } from './modules/hosts/hosts.module';
import { RulesModule } from './modules/rules/rules.module';
import { ConfigModule as XrayConfigModule } from './modules/config/config.module';
import { MetricsModule } from './modules/metrics/metrics.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ApiTokensModule } from './modules/api-tokens/api-tokens.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { TrafficModule } from './modules/traffic/traffic.module';
import { BackupsModule } from './modules/backups/backups.module';
import { ReportsModule } from './modules/reports/reports.module';
import { CertificatesModule } from './modules/certificates/certificates.module';
import { SettingsModule } from './modules/settings/settings.module';
import { RoutingModule } from './modules/routing/routing.module';
import { ConfigProfilesModule } from './modules/config-profiles/config-profiles.module';
import { UpdatesModule } from './modules/updates/updates.module';
import { DoctorModule } from './modules/doctor/doctor.module';
import { SquadsModule } from './modules/squads/squads.module';
import { DevicesModule } from './modules/devices/devices.module';
import { HealthChecksModule } from './modules/health-checks/health-checks.module';
import { SubscriptionTemplatesModule } from './modules/subscription-templates/subscription-templates.module';
import { GeodataModule } from './modules/geodata/geodata.module';
import { McpModule } from './modules/mcp/mcp.module';
import { ControlModule } from './modules/control/control.module';
import { WizardModule } from './modules/wizard/wizard.module';
import { CheburcheckModule } from './modules/cheburcheck/cheburcheck.module';
import { BalancersModule } from './modules/balancers/balancers.module';
import { TelegramBotModule } from './modules/telegram-bot/telegram-bot.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot({
      throttlers: [
        {
          ttl: Number(process.env.THROTTLE_TTL ?? 60_000),
          limit: Number(process.env.THROTTLE_LIMIT ?? 120),
        },
      ],
      storage: new RedisThrottlerStorage(),
    }),
    PrismaModule,
    PasswordModule,
    AuthModule,
    UsersModule,
    NodesModule,
    NodeProvisionModule,
    HealthModule,
    SubscriptionsModule,
    AuditModule,
    InboundsModule,
    HostsModule,
    RulesModule,
    XrayConfigModule,
    MetricsModule,
    NotificationsModule,
    ApiTokensModule,
    PaymentsModule,
    OrganizationsModule,
    TrafficModule,
    BackupsModule,
    ReportsModule,
    CertificatesModule,
    SettingsModule,
    RoutingModule,
    ConfigProfilesModule,
    UpdatesModule,
    DoctorModule,
    SquadsModule,
    DevicesModule,
    HealthChecksModule,
    SubscriptionTemplatesModule,
    GeodataModule,
    McpModule,
    ControlModule,
    WizardModule,
    CheburcheckModule,
    BalancersModule,
    TelegramBotModule,
  ],
  providers: [
    SeedService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
