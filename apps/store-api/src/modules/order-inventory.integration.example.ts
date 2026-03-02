import { Injectable } from '@nestjs/common';
import { PrismaService } from 'database';
import { InventoryService } from './inventory/inventory.service';

interface PlaceOrderItemInput {
  variantId: string;
  quantity: number;
}

@Injectable()
export class OrderInventoryIntegrationExampleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
  ) {}

  async deductInventoryForPlacedOrder(params: {
    orderId: string;
    storeId: string;
    userId: string;
    items: PlaceOrderItemInput[];
  }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // Example only: after creating order records, call inventory in same transaction.
      for (const item of params.items) {
        await this.inventoryService.deductStock({
          storeId: params.storeId,
          variantId: item.variantId,
          quantity: item.quantity,
          changedBy: params.userId,
          tx,
        });
      }

      // Example: mark order as placed/confirmed in the same tx boundary.
      await tx.order.update({
        where: { id: params.orderId },
        data: { status: 'ORDER_PLACED' },
      });
    });
  }
}
