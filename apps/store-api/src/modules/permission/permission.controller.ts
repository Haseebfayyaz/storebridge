import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'auth';
import { PermissionService } from './permission.service';

@Controller('permissions')
@UseGuards(JwtAuthGuard)
export class PermissionController {
  constructor(private readonly permissionService: PermissionService) {}

  @Get()
  findAll() {
    return this.permissionService.findAll();
  }

  @Get('grouped')
  findGrouped() {
    return this.permissionService.findGrouped();
  }

  @Post('seed-defaults')
  seedDefaults() {
    return this.permissionService.seedDefaults();
  }
}
