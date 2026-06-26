import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { OutboxService } from 'common';
import { PrismaService } from 'database';
import { OrdersService } from './orders.service';
import { InventoryService } from '../inventory/inventory.service';

describe('OrdersService', () => {
  let service: OrdersService;
  let prisma: {
    order: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      count: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let inventoryService: {
    restoreOrderStock: jest.Mock;
  };
  let outboxService: {
    enqueue: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      order: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    inventoryService = {
      restoreOrderStock: jest.fn().mockResolvedValue(undefined),
    };
    outboxService = {
      enqueue: jest.fn().mockResolvedValue(undefined),
    };
    prisma.$transaction.mockImplementation((cb: (tx: unknown) => unknown) =>
      cb(prisma),
    );

    const moduleRef = await Test.createTestingModule({
      providers: [
        OrdersService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
        {
          provide: InventoryService,
          useValue: inventoryService,
        },
        {
          provide: OutboxService,
          useValue: outboxService,
        },
      ],
    }).compile();

    service = moduleRef.get(OrdersService);
  });

  it('lists orders for the authenticated user', async () => {
    prisma.order.findMany.mockResolvedValue([
      {
        id: 'order-1',
        status: 'PENDING',
        paymentMethod: 'COD',
        total: 500,
        isPaid: false,
        customerName: 'John',
        customerEmail: 'john@example.com',
        customerPhone: '123',
        shippingStreet: 'Street',
        shippingCity: 'Lahore',
        shippingState: 'Punjab',
        shippingZip: '54000',
        shippingCountry: 'PK',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        items: [
          {
            variantId: 'var-1',
            quantity: 2,
            price: 250,
            variant: { product: { name: 'Phone' } },
          },
        ],
      },
    ]);

    await expect(service.getOrders('user-1')).resolves.toEqual([
      {
        id: 'order-1',
        status: 'PENDING',
        paymentMethod: 'COD',
        total: 500,
        isPaid: false,
        customer: {
          name: 'John',
          email: 'john@example.com',
          phone: '123',
        },
        shipping: {
          street: 'Street',
          city: 'Lahore',
          state: 'Punjab',
          zip: '54000',
          country: 'PK',
        },
        items: [
          {
            variantId: 'var-1',
            productName: 'Phone',
            quantity: 2,
            price: 250,
          },
        ],
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ]);
  });

  it('throws when the order does not belong to the user', async () => {
    prisma.order.findFirst.mockResolvedValue(null);

    await expect(service.getOrder('user-1', 'order-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('cancels an unpaid order and restores stock', async () => {
    prisma.order.findFirst.mockResolvedValue({
      id: 'order-1',
      userId: 'user-1',
      storeId: 'store-1',
      status: 'PENDING',
      paymentMethod: 'COD',
      total: 500,
      isPaid: false,
      items: [{ variantId: 'var-1', quantity: 2 }],
      store: { tenantId: 'tenant-1' },
    });
    prisma.order.update.mockResolvedValue({
      id: 'order-1',
      userId: 'user-1',
      storeId: 'store-1',
      status: 'CANCELLED',
      paymentMethod: 'COD',
      total: 500,
      isPaid: false,
      customerName: null,
      customerEmail: null,
      customerPhone: null,
      shippingStreet: null,
      shippingCity: null,
      shippingState: null,
      shippingZip: null,
      shippingCountry: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      items: [
        {
          variantId: 'var-1',
          quantity: 2,
          price: 250,
          variant: { product: { name: 'Phone' } },
        },
      ],
      store: { id: 'store-1', name: 'Store', city: 'Lahore', country: 'PK' },
    });

    await service.cancelOrder('user-1', 'order-1');

    expect(inventoryService.restoreOrderStock).toHaveBeenCalledWith(
      prisma,
      'store-1',
      [{ variantId: 'var-1', quantity: 2 }],
    );
    expect(outboxService.enqueue).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        eventType: 'order.cancelled',
        aggregateType: 'Order',
        aggregateId: 'order-1',
      }),
    );
  });
});
