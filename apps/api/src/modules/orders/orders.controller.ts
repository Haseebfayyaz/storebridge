import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'auth';
import { Request } from 'express';
import { OrdersService } from './orders.service';

interface RequestWithUser extends Request {
  user: {
    sub: string;
  };
}

@UseGuards(JwtAuthGuard)
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  getOrders(@Req() req: RequestWithUser) {
    return this.ordersService.getOrders(req.user.sub);
  }

  @Get(':orderId')
  getOrder(@Req() req: RequestWithUser, @Param('orderId') orderId: string) {
    return this.ordersService.getOrder(req.user.sub, orderId);
  }
}
