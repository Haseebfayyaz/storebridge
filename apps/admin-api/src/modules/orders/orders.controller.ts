import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, Roles, RolesGuard } from 'auth';
import { CurrentUser } from 'common';
import { AppRole } from 'models';
import { ListOrdersQueryDto } from './dto/list-orders-query.dto';
import { OrdersService } from './orders.service';

interface RequestUser {
  sub: string;
  role: string;
  tenantId: string | null;
}

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AppRole.ADMIN)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get('orders')
  findOrders(
    @Query() query: ListOrdersQueryDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.ordersService.listOrders({
      ...query,
      tenantId: query.tenantId ?? user.tenantId ?? undefined,
    });
  }

  @Get('orders/:id')
  findOrder(@Param('id') id: string) {
    return this.ordersService.getOrder(id);
  }
}
