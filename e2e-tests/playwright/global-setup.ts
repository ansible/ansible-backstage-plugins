import { setupNonAdminRBAC } from './utils/rbac-setup';

function redactMessage(msg: string): string {
  const keys = ['AAP_TOKEN', 'AAP_NONADMIN_USER_ID'];
  let sanitized = msg;
  for (const key of keys) {
    const val = process.env[key];
    if (val) sanitized = sanitized.split(val).join(`[${key}]`);
  }
  return sanitized;
}

async function globalSetup() {
  if (process.env.AAP_NONADMIN_USER_ID && process.env.AAP_TOKEN) {
    try {
      await setupNonAdminRBAC();
    } catch (error) {
      const message = redactMessage((error as Error).message);
      console.error('[Global Setup] Non-admin setup failed:', message);
      throw error;
    }
  }
}

export default globalSetup;
