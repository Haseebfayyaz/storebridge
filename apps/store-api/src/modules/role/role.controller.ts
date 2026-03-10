import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'auth';
import { CurrentUser } from 'common';
import { CreateRoleDto } from './dto/create-role.dto';
import { ManageRolePermissionsDto } from './dto/manage-role-permissions.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { RoleService } from './role.service';

interface RequestUser {
  sub: string;
  tenantId: string | null;
}

@Controller('roles')
@UseGuards(JwtAuthGuard)
export class RoleController {
  constructor(private readonly roleService: RoleService) {}

  @Post()
  create(@Body() dto: CreateRoleDto, @CurrentUser() user: RequestUser) {
    return this.roleService.create(dto, user.tenantId);
  }

  @Get()
  findAll(@CurrentUser() user: RequestUser) {
    return this.roleService.findAll(user.tenantId);
  }

  @Get('me/permissions')
  getMyRolePermissions(@CurrentUser() user: RequestUser) {
    return this.roleService.getCurrentUserRolePermissions(user.sub, user.tenantId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateRoleDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.roleService.update(id, dto, user.tenantId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.roleService.remove(id, user.tenantId);
  }

  @Post(':id/permissions')
  managePermissions(
    @Param('id') id: string,
    @Body() dto: ManageRolePermissionsDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.roleService.managePermissions(id, dto, user.tenantId);
  }
}
