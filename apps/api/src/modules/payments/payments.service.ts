import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ORDER_EVENT_TYPES, OutboxService, PAYMENT_EVENT_TYPES } from 'common';
import { PrismaService } from 'database';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outboxService: OutboxService,
  ) {}

  async capturePayment(orderId: string, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: {
          store: {
            select: {
              tenantId: true,
            },
          },
        },
      });

      if (!order) {
        throw new NotFoundException('Order not found.');
      }

      if (order.status === 'CANCELLED') {
        throw new BadRequestException(
          'Cannot capture payment for cancelled order',
        );
      }

      if (order.isPaid) {
        throw new BadRequestException('Order is already paid');
      }

      const updated = await tx.order.update({
        where: { id: order.id },
        data: {
          isPaid: true,
          status: 'ORDER_PLACED',
        },
      });

      await this.outboxService.enqueue(tx, {
        eventType: PAYMENT_EVENT_TYPES.CAPTURED,
        aggregateType: 'Payment',
        aggregateId: updated.id,
        tenantId: order.store?.tenantId ?? null,
        storeId: order.storeId,
        actorId,
        payload: {
          orderId: updated.id,
          storeId: updated.storeId,
          userId: updated.userId,
          paymentMethod: updated.paymentMethod,
          amount: updated.total,
          status: updated.status,
          isPaid: updated.isPaid,
        },
      });

      await this.outboxService.enqueue(tx, {
        eventType: ORDER_EVENT_TYPES.STATUS_CHANGED,
        aggregateType: 'Order',
        aggregateId: updated.id,
        tenantId: order.store?.tenantId ?? null,
        storeId: order.storeId,
        actorId,
        payload: {
          orderId: updated.id,
          previousStatus: order.status,
          status: updated.status,
          isPaid: updated.isPaid,
        },
      });

      return updated;
    });
  }

  async refundPayment(orderId: string, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: {
          store: {
            select: {
              tenantId: true,
            },
          },
        },
      });

      if (!order) {
        throw new NotFoundException('Order not found.');
      }

      if (!order.isPaid) {
        throw new BadRequestException('Order is not paid');
      }

      const updated = await tx.order.update({
        where: { id: order.id },
        data: {
          isPaid: false,
          status: 'CANCELLED',
        },
      });

      await this.outboxService.enqueue(tx, {
        eventType: PAYMENT_EVENT_TYPES.REFUNDED,
        aggregateType: 'Payment',
        aggregateId: updated.id,
        tenantId: order.store?.tenantId ?? null,
        storeId: order.storeId,
        actorId,
        payload: {
          orderId: updated.id,
          storeId: updated.storeId,
          userId: updated.userId,
          amount: updated.total,
          status: updated.status,
          isPaid: updated.isPaid,
        },
      });

      await this.outboxService.enqueue(tx, {
        eventType: ORDER_EVENT_TYPES.CANCELLED,
        aggregateType: 'Order',
        aggregateId: updated.id,
        tenantId: order.store?.tenantId ?? null,
        storeId: order.storeId,
        actorId,
        payload: {
          orderId: updated.id,
          status: updated.status,
          isPaid: updated.isPaid,
        },
      });

      return updated;
    });
  }
}
