import { Module } from '@nestjs/common';
import { AuthModule } from 'auth';
import { AppConfigModule } from 'config';
import { DatabaseModule } from 'database';
import { AppAuthController } from './modules/auth/auth.controller';
import { OrdersModule } from './modules/orders/orders.module';

@Module({
  imports: [
    AppConfigModule.forApp('apps/admin-api/.env'),
    DatabaseModule,
    AuthModule,
    OrdersModule,
  ],
  controllers: [AppAuthController],
})
export class AppModule {}
