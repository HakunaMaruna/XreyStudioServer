-- Reversible down migration for template defaults and squad bindings (PostgreSQL).
ALTER TABLE "Squad" DROP COLUMN IF EXISTS "subscriptionTemplateId";
ALTER TABLE "SubscriptionTemplate" DROP COLUMN IF EXISTS "isDefault";
