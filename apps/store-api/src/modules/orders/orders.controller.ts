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
import { ListOrdersQueryDto } from './dto/list-orders-query.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { OrdersService } from './orders.service';

interface RequestUser {
  sub: string;
  tenantId: string | null;
}

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get('orders')
  @Roles(AppRole.ADMIN, AppRole.STORE)
  findOrders(
    @Query() query: ListOrdersQueryDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.ordersService.listOrders(query, user.tenantId);
  }

  @Get('orders/:id')
  @Roles(AppRole.ADMIN, AppRole.STORE)
  findOrder(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.ordersService.getOrder(id, user.tenantId);
  }

  @Patch('orders/:id/status')
  @Roles(AppRole.ADMIN, AppRole.STORE)
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.ordersService.updateOrderStatus(
      id,
      dto,
      user.tenantId,
      user.sub,
    );
  }

  @Delete('orders/:id')
  @Roles(AppRole.ADMIN, AppRole.STORE)
  cancelOrder(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.ordersService.cancelOrder(id, user.tenantId, user.sub);
  }
}
