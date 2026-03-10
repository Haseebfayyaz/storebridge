import { Module } from '@nestjs/common';
import { DatabaseModule } from 'database';
import { PermissionModule } from '../permission/permission.module';
import { RoleController } from './role.controller';
import { RoleService } from './role.service';

@Module({
  imports: [DatabaseModule, PermissionModule],
  controllers: [RoleController],
  providers: [RoleService],
})
export class RoleModule {}
