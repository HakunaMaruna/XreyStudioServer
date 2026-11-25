import { Injectable } from '@nestjs/common';

/**
 * AuthProvider stub. Real registration/login will be added later without changing call sites.
 * masterToken() — token used by master to call store.
 * tenantToken() — token used by tenant to call master.
 */
export interface AuthProvider {
  masterToken(): string;
  tenantToken(): string;
  mode(): 'control' | 'tenant';
}

@Injectable()
export class EnvAuthProvider implements AuthProvider {
  masterToken() { return process.env.STORE_API_TOKEN || ''; }
  tenantToken() { return process.env.CONTROL_TENANT_TOKEN || ''; }
  mode() { return process.env.PANEL_MODE === 'control' ? 'control' : 'tenant'; }
}
