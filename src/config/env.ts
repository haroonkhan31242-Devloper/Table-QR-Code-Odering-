/**
 * Demo configuration read from Vite environment variables.
 *
 * SECURITY: every VITE_* variable is inlined into the browser bundle at build
 * time. These values are NOT secret and must only be used for a local demo.
 * Replace the demo auth provider with Firebase Authentication or a backend
 * before any real deployment.
 */
function read(key: string): string {
  const value = (import.meta.env as Record<string, string | undefined>)[key];
  return typeof value === 'string' ? value.trim() : '';
}

export const demoEnv = {
  superAdminUsername: read('VITE_DEMO_SUPER_ADMIN_USERNAME'),
  superAdminPassword: read('VITE_DEMO_SUPER_ADMIN_PASSWORD'),
  restaurantUsername: read('VITE_DEMO_RESTAURANT_USERNAME'),
  restaurantPassword: read('VITE_DEMO_RESTAURANT_PASSWORD'),
  /** Optional shared password for the other seeded demo staff accounts. */
  staffPassword: read('VITE_DEMO_STAFF_PASSWORD') || read('VITE_DEMO_RESTAURANT_PASSWORD'),
};

export const isSuperAdminConfigured = Boolean(demoEnv.superAdminUsername && demoEnv.superAdminPassword);
export const isRestaurantDemoConfigured = Boolean(demoEnv.restaurantUsername && demoEnv.restaurantPassword);
