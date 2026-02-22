import { Module } from '@nestjs/common';
import { AuthModule } from 'auth';
import { AppConfigModule } from 'config';
import { DatabaseModule } from 'database';
import { AppAuthController } from './modules/auth/auth.controller';

@Module({
  imports: [AppConfigModule.forApp('apps/api/.env'), DatabaseModule, AuthModule],
  controllers: [AppAuthController],
})
export class AppModule {}
