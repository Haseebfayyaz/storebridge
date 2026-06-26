import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ORDER_EVENT_TYPES, OutboxService } from 'common';
import { PrismaService } from 'database';
import { InventoryService } from '../inventory/inventory.service';
import { ListOrdersQueryDto } from './dto/list-orders-query.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
    private readonly outboxService: OutboxService,
  ) {}

  async listOrders(query: ListOrdersQueryDto, tenantId: string | null) {
    const scopedTenantId = this.requireTenant(tenantId);
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    const where: Prisma.OrderWhereInput = {
      store: { tenantId: scopedTenantId },
      ...(query.storeId ? { storeId: query.storeId } : {}),
      ...(query.status ? { status: query.status as any } : {}),
      ...(query.search
        ? {
            OR: [
              { id: { contains: query.search, mode: 'insensitive' } },
              { customerName: { contains: query.search, mode: 'insensitive' } },
              {
                customerEmail: { contains: query.search, mode: 'insensitive' },
              },
              {
                customerPhone: { contains: query.search, mode: 'insensitive' },
              },
            ],
          }
        : {}),
    };

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: {
          store: {
            select: { id: true, name: true, city: true, country: true },
          },
          items: {
            include: {
              variant: { include: { product: { select: { name: true } } } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      data: orders.map((order) => this.mapOrder(order)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      filters: {
        search: query.search ?? null,
        status: query.status ?? null,
        storeId: query.storeId ?? null,
      },
    };
  }

  async getOrder(orderId: string, tenantId: string | null) {
    const scopedTenantId = this.requireTenant(tenantId);
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, store: { tenantId: scopedTenantId } },
      include: {
        store: { select: { id: true, name: true, city: true, country: true } },
        items: {
          include: {
            variant: { include: { product: { select: { name: true } } } },
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return this.mapOrder(order);
  }

  async updateOrderStatus(
    orderId: string,
    dto: UpdateOrderStatusDto,
    tenantId: string | null,
    actorId?: string,
  ) {
    const scopedTenantId = this.requireTenant(tenantId);

    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: orderId, store: { tenantId: scopedTenantId } },
        include: { store: { select: { tenantId: true } } },
      });

      if (!order) {
        throw new NotFoundException('Order not found');
      }

      const updated = await tx.order.update({
        where: { id: order.id },
        data: { status: dto.status as any },
        include: {
          store: {
            select: { id: true, name: true, city: true, country: true },
          },
          items: {
            include: {
              variant: { include: { product: { select: { name: true } } } },
            },
          },
        },
      });

      await this.outboxService.enqueue(tx, {
        eventType: ORDER_EVENT_TYPES.STATUS_CHANGED,
        aggregateType: 'Order',
        aggregateId: updated.id,
        tenantId: order.store.tenantId,
        storeId: updated.storeId,
        actorId: actorId ?? null,
        payload: {
          orderId: updated.id,
          previousStatus: order.status,
          status: updated.status,
          note: dto.note ?? null,
        },
      });

      return this.mapOrder(updated);
    });
  }

  async cancelOrder(
    orderId: string,
    tenantId: string | null,
    actorId?: string,
  ) {
    const scopedTenantId = this.requireTenant(tenantId);

    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: orderId, store: { tenantId: scopedTenantId } },
        include: {
          items: true,
          store: { select: { tenantId: true } },
        },
      });

      if (!order) {
        throw new NotFoundException('Order not found');
      }

      if (order.status === 'CANCELLED') {
        throw new BadRequestException('Order is already cancelled');
      }

      if (order.status === 'SHIPPED' || order.status === 'DELIVERED') {
        throw new BadRequestException('Shipped orders cannot be cancelled');
      }

      if (order.isPaid) {
        throw new BadRequestException('Paid orders must be refunded first');
      }

      await this.inventoryService.restoreOrderStock(
        order.storeId,
        order.items.map((item) => ({
          variantId: item.variantId,
          quantity: item.quantity,
        })),
        actorId,
        tx,
      );

      const cancelled = await tx.order.update({
        where: { id: order.id },
        data: { status: 'CANCELLED' },
        include: {
          store: {
            select: { id: true, name: true, city: true, country: true },
          },
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
        actorId: actorId ?? null,
        payload: {
          orderId: cancelled.id,
          previousStatus: order.status,
          status: cancelled.status,
          isPaid: cancelled.isPaid,
        },
      });

      return this.mapOrder(cancelled);
    });
  }

  private mapOrder(order: {
    id: string;
    storeId: string;
    status: string;
    paymentMethod: string;
    total: number;
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
    store?: { id: string; name: string; city: string; country: string };
    items?: Array<{
      variantId: string;
      quantity: number;
      price: number;
      variant: { product: { name: string } };
    }>;
  }) {
    return {
      id: order.id,
      storeId: order.storeId,
      status: order.status,
      paymentMethod: order.paymentMethod,
      total: order.total,
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
      store: order.store ?? null,
      items:
        order.items?.map((item) => ({
          variantId: item.variantId,
          productName: item.variant.product.name,
          quantity: item.quantity,
          price: item.price,
        })) ?? [],
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  }

  private requireTenant(tenantId: string | null) {
    if (!tenantId) {
      throw new BadRequestException('Tenant context is required');
    }

    return tenantId;
  }
}
