import { Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

export interface OutboxEventInput {
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: Prisma.InputJsonValue;
  tenantId?: string | null;
  storeId?: string | null;
  actorId?: string | null;
  correlationId?: string | null;
  causationId?: string | null;
  schemaVersion?: number;
}

@Injectable()
export class OutboxService {
  enqueue(
    tx: Prisma.TransactionClient | PrismaClient,
    event: OutboxEventInput,
  ) {
    return tx.outboxEvent.create({
      data: {
        eventType: event.eventType,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        payload: event.payload,
        tenantId: event.tenantId ?? null,
        storeId: event.storeId ?? null,
        actorId: event.actorId ?? null,
        correlationId: event.correlationId ?? null,
        causationId: event.causationId ?? null,
        schemaVersion: event.schemaVersion ?? 1,
      },
    });
  }
}
