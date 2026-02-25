export const JWT_DEFAULT_EXPIRES_IN = '1d';

export const SYSTEM_ROLE_VENDOR_OWNER = 'Vendor Owner';
export const SYSTEM_ROLE_STORE_MANAGER = 'Store Manager';

export const DEFAULT_PERMISSION_SEED = [
  { name: 'users.read', module: 'users', description: 'Read users' },
  { name: 'users.write', module: 'users', description: 'Manage users' },
  { name: 'stores.read', module: 'stores', description: 'Read stores' },
  { name: 'stores.write', module: 'stores', description: 'Manage stores' },
  { name: 'orders.read', module: 'orders', description: 'Read orders' },
  { name: 'orders.write', module: 'orders', description: 'Manage orders' },
  { name: 'products.read', module: 'products', description: 'Read products' },
  { name: 'products.write', module: 'products', description: 'Manage products' },
  { name: 'inventory.read', module: 'inventory', description: 'Read inventory' },
  { name: 'inventory.write', module: 'inventory', description: 'Manage inventory' },
  { name: 'roles.read', module: 'roles', description: 'Read roles' },
  { name: 'roles.write', module: 'roles', description: 'Manage roles and permissions' },
] as const;
