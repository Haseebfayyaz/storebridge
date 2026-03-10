import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEFAULT_PERMISSIONS = [
  { name: 'product.create', module: 'products', description: 'Create products' },
  { name: 'product.update', module: 'products', description: 'Update products' },
  { name: 'product.delete', module: 'products', description: 'Delete products' },
  { name: 'product.view', module: 'products', description: 'View products' },

  { name: 'order.create', module: 'orders', description: 'Create orders' },
  { name: 'order.view', module: 'orders', description: 'View orders' },

  { name: 'invoice.create', module: 'invoices', description: 'Create invoices' },
  { name: 'invoice.view', module: 'invoices', description: 'View invoices' },

  { name: 'category.create', module: 'categories', description: 'Create categories' },
  { name: 'category.update', module: 'categories', description: 'Update categories' },
  { name: 'category.delete', module: 'categories', description: 'Delete categories' },

  { name: 'taxclass.create', module: 'taxes', description: 'Create tax classes' },
  { name: 'taxclass.update', module: 'taxes', description: 'Update tax classes' },
  { name: 'taxclass.delete', module: 'taxes', description: 'Delete tax classes' },

  { name: 'inventory.update', module: 'inventory', description: 'Update inventory' },
  { name: 'user.manage', module: 'users', description: 'Manage users' },
] as const;

async function main() {
  for (const permission of DEFAULT_PERMISSIONS) {
    await prisma.permission.upsert({
      where: { name: permission.name },
      update: {
        module: permission.module,
        description: permission.description,
      },
      create: permission,
    });
  }

  console.log(`Seeded ${DEFAULT_PERMISSIONS.length} default permissions`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
