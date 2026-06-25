import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard, Roles, RolesGuard } from 'auth';
import { CurrentUser } from 'common';
import { AppRole } from 'models';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { UsersService } from './users.service';

interface RequestUser {
  sub: string;
  tenantId: string | null;
}

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('users')
  @Roles(AppRole.ADMIN, AppRole.STORE)
  findUsers(@Query() query: ListUsersQueryDto, @CurrentUser() user: RequestUser) {
    return this.usersService.listUsers(query, user.tenantId);
  }

  @Get('customers')
  @Roles(AppRole.ADMIN, AppRole.STORE)
  findCustomers(
    @Query() query: ListUsersQueryDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.usersService.listCustomers(query, user.tenantId);
  }

  @Patch('users/:id/role')
  @Roles(AppRole.ADMIN)
  updateRole(
    @Param('id') id: string,
    @Body() dto: UpdateUserRoleDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.usersService.updateUserRole(id, dto, user.tenantId, user.sub);
  }

  @Delete('users/:id')
  @Roles(AppRole.ADMIN)
  remove(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.usersService.deleteUser(id, user.tenantId, user.sub);
  }
}
