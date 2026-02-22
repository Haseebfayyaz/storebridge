import { Module } from '@nestjs/common';
import { AuthModule } from 'auth';
import { AppConfigModule } from 'config';
import { DatabaseModule } from 'database';
import { AppAuthController } from './modules/auth/auth.controller';
import { StoreModule } from './modules/store/store.module';

@Module({
  imports: [
    AppConfigModule.forApp('apps/store-api/.env'),
    DatabaseModule,
    AuthModule,
    StoreModule,
  ],
  controllers: [AppAuthController],
})
export class AppModule {}
