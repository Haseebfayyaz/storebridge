import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PaymentMethod } from '@prisma/client';
import { ORDER_EVENT_TYPES, OutboxService } from 'common';
import { PrismaService } from 'database';
import { InventoryService } from '../inventory/inventory.service';

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
    private readonly outboxService: OutboxService,
  ) {}

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

  async cancelOrder(userId: string, orderId: string) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: orderId, userId },
        include: {
          store: {
            select: {
              tenantId: true,
            },
          },
          items: true,
        },
      });

      if (!order) {
        throw new NotFoundException('Order not found.');
      }

      if (order.status === 'CANCELLED') {
        throw new BadRequestException('Order is already cancelled');
      }

      if (order.status === 'SHIPPED' || order.status === 'DELIVERED') {
        throw new BadRequestException('Shipped orders cannot be cancelled');
      }

      if (order.isPaid) {
        throw new BadRequestException(
          'Paid orders must be refunded by the payments workflow',
        );
      }

      await this.inventoryService.restoreOrderStock(
        tx,
        order.storeId,
        order.items.map((item) => ({
          variantId: item.variantId,
          quantity: item.quantity,
        })),
      );

      const cancelled = await tx.order.update({
        where: { id: order.id },
        data: { status: 'CANCELLED' },
        include: {
          items: {
            include: {
              variant: { include: { product: { select: { name: true } } } },
            },
          },
        },
      });

      await this.outboxService.enqueue(tx, {
        eventType: ORDER_EVENT_TYPES.CANCELLED,
        aggregateType: 'Order',
        aggregateId: cancelled.id,
        tenantId: order.store.tenantId,
        storeId: cancelled.storeId,
        actorId: userId,
        payload: {
          orderId: cancelled.id,
          userId,
          storeId: cancelled.storeId,
          status: cancelled.status,
          isPaid: cancelled.isPaid,
          total: cancelled.total,
          cancelledAt: new Date().toISOString(),
        },
      });

      return this.mapOrderDetail(cancelled);
    });
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
