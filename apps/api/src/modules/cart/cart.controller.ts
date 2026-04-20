import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from 'auth';
import { Request } from 'express';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';
import { UpsertAddressDto } from './dto/upsert-address.dto';
import { CartService } from './cart.service';

interface RequestWithUser extends Request {
  user: {
    sub: string;
  };
}

@UseGuards(JwtAuthGuard)
@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  getCart(@Req() req: RequestWithUser) {
    return this.cartService.getCart(req.user.sub);
  }

  @Post('items')
  addItem(@Req() req: RequestWithUser, @Body() dto: AddCartItemDto) {
    return this.cartService.addItem(req.user.sub, dto);
  }

  @Patch('items')
  updateItem(@Req() req: RequestWithUser, @Body() dto: UpdateCartItemDto) {
    return this.cartService.updateItem(req.user.sub, dto);
  }

  @Delete('items/:inventoryId')
  removeItem(@Req() req: RequestWithUser, @Param('inventoryId') inventoryId: string) {
    return this.cartService.removeItem(req.user.sub, inventoryId);
  }

  @Post('address')
  upsertAddress(@Req() req: RequestWithUser, @Body() dto: UpsertAddressDto) {
    return this.cartService.upsertAddress(req.user.sub, dto);
  }

  @Post('checkout')
  createOrder(@Req() req: RequestWithUser, @Body() dto: CreateOrderDto) {
    return this.cartService.createOrder(req.user.sub, dto);
  }

  @Get('orders')
  getOrders(@Req() req: RequestWithUser) {
    return this.cartService.getOrders(req.user.sub);
  }

  @Get('orders/:orderId')
  getOrder(@Req() req: RequestWithUser, @Param('orderId') orderId: string) {
    return this.cartService.getOrder(req.user.sub, orderId);
  }
}
