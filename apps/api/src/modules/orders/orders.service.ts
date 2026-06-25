import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PaymentMethod } from '@prisma/client';
import { PrismaService } from 'database';

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async getOrders(userId: string) {
    const orders = await this.prisma.order.findMany({
      where: { userId },
      include: {
        items: {
          include: {
            variant: { include: { product: { select: { name: true } } } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return orders.map((order) => this.mapOrderListItem(order));
  }

  async getOrder(userId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
      include: {
        items: {
          include: {
            variant: { include: { product: { select: { name: true } } } },
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found.');
    }

    return this.mapOrderDetail(order);
  }

  private mapOrderListItem(order: {
    id: string;
    status: string;
    paymentMethod: PaymentMethod;
    total: Prisma.Decimal | number;
    isPaid: boolean;
    customerName: string | null;
    customerEmail: string | null;
    customerPhone: string | null;
    shippingStreet: string | null;
    shippingCity: string | null;
    shippingState: string | null;
    shippingZip: string | null;
    shippingCountry: string | null;
    createdAt: Date;
    items: Array<{
      variantId: string;
      quantity: number;
      price: Prisma.Decimal | number;
      variant: { product: { name: string } };
    }>;
  }) {
    return {
      id: order.id,
      status: order.status,
      paymentMethod: order.paymentMethod,
      total: Number(order.total),
      isPaid: order.isPaid,
      customer: {
        name: order.customerName,
        email: order.customerEmail,
        phone: order.customerPhone,
      },
      shipping: {
        street: order.shippingStreet,
        city: order.shippingCity,
        state: order.shippingState,
        zip: order.shippingZip,
        country: order.shippingCountry,
      },
      items: order.items.map((item) => ({
        variantId: item.variantId,
        productName: item.variant.product.name,
        quantity: item.quantity,
        price: Number(item.price),
      })),
      createdAt: order.createdAt,
    };
  }

  private mapOrderDetail(order: {
    id: string;
    status: string;
    paymentMethod: PaymentMethod;
    total: Prisma.Decimal | number;
    isPaid: boolean;
    customerName: string | null;
    customerEmail: string | null;
    customerPhone: string | null;
    shippingStreet: string | null;
    shippingCity: string | null;
    shippingState: string | null;
    shippingZip: string | null;
    shippingCountry: string | null;
    createdAt: Date;
    updatedAt: Date;
    items: Array<{
      variantId: string;
      quantity: number;
      price: Prisma.Decimal | number;
      variant: { product: { name: string } };
    }>;
  }) {
    return {
      id: order.id,
      status: order.status,
      paymentMethod: order.paymentMethod,
      total: Number(order.total),
      isPaid: order.isPaid,
      customer: {
        name: order.customerName,
        email: order.customerEmail,
        phone: order.customerPhone,
      },
      shipping: {
        street: order.shippingStreet,
        city: order.shippingCity,
        state: order.shippingState,
        zip: order.shippingZip,
        country: order.shippingCountry,
      },
      items: order.items.map((item) => ({
        variantId: item.variantId,
        productName: item.variant.product.name,
        quantity: item.quantity,
        price: Number(item.price),
      })),
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  }
}
