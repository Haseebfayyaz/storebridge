import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from 'database';
import { OrdersService } from './orders.service';

describe('OrdersService', () => {
  let service: OrdersService;
  let prisma: {
    order: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      order: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        OrdersService,
        {
          provide: PrismaService,
          useValue: prisma,
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
});
