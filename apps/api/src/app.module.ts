import { Module } from '@nestjs/common';
import { AuthModule } from 'auth';
import { AppConfigModule } from 'config';
import { DatabaseModule } from 'database';
import { AppAuthController } from './modules/auth/auth.controller';
import { CartModule } from './modules/cart/cart.module';
import { InventoryModule } from './modules/inventory/inventory.module';

@Module({
  imports: [
    AppConfigModule.forApp('apps/api/.env'),
    DatabaseModule,
    AuthModule,
    InventoryModule,
    CartModule,
  ],
  controllers: [AppAuthController],
})
export class AppModule {}
