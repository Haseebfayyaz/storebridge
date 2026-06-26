import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'database';
import { ListOrdersQueryDto } from './dto/list-orders-query.dto';

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async listOrders(query: ListOrdersQueryDto) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    const where: Prisma.OrderWhereInput = {
      ...(query.tenantId ? { store: { tenantId: query.tenantId } } : {}),
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
      data: orders.map((order) => ({
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
        store: order.store,
        items: order.items.map((item) => ({
          variantId: item.variantId,
          productName: item.variant.product.name,
          quantity: item.quantity,
          price: item.price,
        })),
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      filters: {
        tenantId: query.tenantId ?? null,
        storeId: query.storeId ?? null,
        status: query.status ?? null,
        search: query.search ?? null,
      },
    };
  }

  async getOrder(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
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
      store: order.store,
      items: order.items.map((item) => ({
        variantId: item.variantId,
        productName: item.variant.product.name,
        quantity: item.quantity,
        price: item.price,
      })),
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  }
}
