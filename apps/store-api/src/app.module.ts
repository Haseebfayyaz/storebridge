import { Module } from '@nestjs/common';
import { AuthModule } from 'auth';
import { AppConfigModule } from 'config';
import { DatabaseModule } from 'database';
import { AppAuthController } from './modules/auth/auth.controller';
import { StoreModule } from './modules/store/store.module';
import { CategoryModule } from './modules/category/category.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { ProductModule } from './modules/product/product.module';
import { PermissionModule } from './modules/permission/permission.module';
import { OrdersModule } from './modules/orders/orders.module';
import { RoleModule } from './modules/role/role.module';
import { TaxClassModule } from './modules/tax-class/tax-class.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    AppConfigModule.forApp('apps/store-api/.env'),
    DatabaseModule,
    AuthModule,
    StoreModule,
    CategoryModule,
    TaxClassModule,
    ProductModule,
    InventoryModule,
    PermissionModule,
    RoleModule,
    OrdersModule,
    UsersModule,
  ],
  controllers: [AppAuthController],
})
export class AppModule {}
