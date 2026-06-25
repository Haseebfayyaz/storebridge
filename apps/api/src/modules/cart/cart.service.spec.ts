import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { OutboxService } from 'common';
import { PrismaService } from 'database';
import { CartService } from './cart.service';
import { InventoryService } from '../inventory/inventory.service';

describe('CartService', () => {
  let service: CartService;
  let prisma: {
    cart: Record<string, jest.Mock>;
    cartItem: Record<string, jest.Mock>;
    inventory: Record<string, jest.Mock>;
    address: Record<string, jest.Mock>;
    order: Record<string, jest.Mock>;
    $transaction: jest.Mock;
    $executeRaw: jest.Mock;
  };
  let inventoryService: {
    getCartInventoryRecord: jest.Mock;
    reserveStock: jest.Mock;
    releaseStock: jest.Mock;
    buildCheckoutQuote: jest.Mock;
    captureCheckoutStock: jest.Mock;
  };
  let outboxService: {
    enqueue: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      cart: {
        findUnique: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
      },
      cartItem: {
        findUnique: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
        deleteMany: jest.fn(),
      },
      inventory: {
        findFirst: jest.fn(),
        updateMany: jest.fn(),
        findMany: jest.fn(),
      },
      address: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      order: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
      $transaction: jest.fn(),
      $executeRaw: jest.fn(),
    };
    inventoryService = {
      getCartInventoryRecord: jest.fn(),
      reserveStock: jest.fn(),
      releaseStock: jest.fn(),
      buildCheckoutQuote: jest.fn(),
      captureCheckoutStock: jest.fn(),
    };
    outboxService = {
      enqueue: jest.fn().mockResolvedValue(undefined),
    };

    prisma.$transaction.mockImplementation((cb: (tx: unknown) => unknown) =>
      cb(prisma),
    );

    const moduleRef = await Test.createTestingModule({
      providers: [
        CartService,
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

    service = moduleRef.get(CartService);
  });

  it('adds item to cart when stock is available', async () => {
    inventoryService.getCartInventoryRecord.mockResolvedValue({
      id: 'inv-1',
      storeId: 'store-1',
    });
    prisma.cart.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 'cart-1',
      store: { id: 'store-1', name: 'Main', city: 'Lahore', country: 'PK' },
      items: [],
    });
    prisma.cart.create.mockResolvedValue({
      id: 'cart-1',
      userId: 'u1',
      storeId: 'store-1',
    });
    prisma.cartItem.findUnique.mockResolvedValue(null);
    inventoryService.reserveStock.mockResolvedValue(undefined);

    await service.addItem('u1', { inventoryId: 'inv-1', quantity: 2 });

    expect(inventoryService.reserveStock).toHaveBeenCalledWith(
      prisma,
      'inv-1',
      2,
    );
    expect(prisma.cartItem.create).toHaveBeenCalledWith({
      data: { cartId: 'cart-1', inventoryId: 'inv-1', quantity: 2 },
    });
  });

  it('returns a cart snapshot with totals and line items', async () => {
    prisma.cart.findUnique.mockResolvedValue({
      id: 'cart-1',
      store: {
        id: 'store-1',
        name: 'Main Store',
        city: 'Lahore',
        country: 'PK',
      },
      items: [
        {
          inventoryId: 'inv-1',
          quantity: 2,
          inventory: {
            variantId: 'var-1',
            storePrice: 350,
            variant: { price: 300, product: { name: 'Phone' } },
          },
        },
      ],
    });

    const result = await service.getCart('u1');

    expect(result.totals.subtotal).toBe(700);
    expect(result.totals.itemCount).toBe(2);
    expect(result.items).toEqual([
      {
        inventoryId: 'inv-1',
        variantId: 'var-1',
        productName: 'Phone',
        quantity: 2,
        unitPrice: 350,
        lineTotal: 700,
      },
    ]);
  });

  it('throws when adding item from another store', async () => {
    inventoryService.getCartInventoryRecord.mockResolvedValue({
      id: 'inv-1',
      storeId: 'store-2',
    });
    prisma.cart.findUnique.mockResolvedValue({
      id: 'cart-1',
      userId: 'u1',
      storeId: 'store-1',
    });

    await expect(
      service.addItem('u1', { inventoryId: 'inv-1', quantity: 1 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws when stock reservation fails while adding', async () => {
    inventoryService.getCartInventoryRecord.mockResolvedValue({
      id: 'inv-1',
      storeId: 'store-1',
    });
    prisma.cart.findUnique
      .mockResolvedValueOnce({ id: 'cart-1', userId: 'u1', storeId: 'store-1' })
      .mockResolvedValueOnce({
        id: 'cart-1',
        store: { id: 'store-1', name: 'Main', city: 'Lahore', country: 'PK' },
        items: [],
      });
    prisma.cartItem.findUnique.mockResolvedValue(null);
    inventoryService.reserveStock.mockRejectedValue(
      new BadRequestException('Requested quantity is out of stock'),
    );

    await expect(
      service.addItem('u1', { inventoryId: 'inv-1', quantity: 10 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('updates quantity and reserves additional stock for positive delta', async () => {
    prisma.cart.findUnique
      .mockResolvedValueOnce({ id: 'cart-1', userId: 'u1', storeId: 'store-1' })
      .mockResolvedValueOnce({
        id: 'cart-1',
        store: { id: 'store-1', name: 'Main', city: 'Lahore', country: 'PK' },
        items: [],
      });
    prisma.cartItem.findUnique.mockResolvedValue({
      id: 'item-1',
      quantity: 1,
      inventoryId: 'inv-1',
    });
    inventoryService.reserveStock.mockResolvedValue(undefined);

    await service.updateItem('u1', { inventoryId: 'inv-1', quantity: 4 });

    expect(inventoryService.reserveStock).toHaveBeenCalledWith(
      prisma,
      'inv-1',
      3,
    );
    expect(prisma.cartItem.update).toHaveBeenCalledWith({
      where: { id: 'item-1' },
      data: { quantity: 4 },
    });
  });

  it('removes item and deletes empty cart', async () => {
    prisma.cart.findUnique
      .mockResolvedValueOnce({ id: 'cart-1', userId: 'u1', storeId: 'store-1' })
      .mockResolvedValueOnce(null);
    prisma.cartItem.findUnique.mockResolvedValue({
      id: 'item-1',
      quantity: 2,
      inventoryId: 'inv-1',
    });
    inventoryService.releaseStock.mockResolvedValue(undefined);
    prisma.cartItem.count.mockResolvedValue(0);

    await service.removeItem('u1', 'inv-1');

    expect(inventoryService.releaseStock).toHaveBeenCalledWith(
      prisma,
      'inv-1',
      2,
    );
    expect(prisma.cart.delete).toHaveBeenCalledWith({
      where: { id: 'cart-1' },
    });
  });

  it('creates order in pending status with COD and clears cart', async () => {
    prisma.cart.findUnique.mockResolvedValue({
      id: 'cart-1',
      userId: 'u1',
      storeId: 'store-1',
      items: [{ inventoryId: 'inv-1', quantity: 2 }],
    });
    inventoryService.buildCheckoutQuote.mockResolvedValue({
      total: 600,
      items: [
        {
          inventoryId: 'inv-1',
          variantId: 'var-1',
          quantity: 2,
          price: 300,
        },
      ],
    });
    prisma.address.findFirst.mockResolvedValue({
      id: 'addr-1',
      name: 'John',
      email: 'john@example.com',
      phone: '123',
      street: 'Street',
      city: 'LHE',
      state: 'Punjab',
      zip: '54000',
      country: 'PK',
    });
    inventoryService.captureCheckoutStock.mockResolvedValue(undefined);
    prisma.order.create.mockResolvedValue({
      id: 'order-1',
      status: 'PENDING',
      paymentMethod: 'COD',
      total: 600,
      items: [
        {
          variantId: 'var-1',
          quantity: 2,
          price: 300,
          variant: { product: { name: 'Phone' } },
        },
      ],
    });

    const result = await service.createOrder('u1', {});

    expect(inventoryService.buildCheckoutQuote).toHaveBeenCalledWith(
      prisma,
      'store-1',
      [{ inventoryId: 'inv-1', quantity: 2 }],
    );
    expect(inventoryService.captureCheckoutStock).toHaveBeenCalledWith(prisma, [
      { inventoryId: 'inv-1', quantity: 2 },
    ]);
    expect(result.status).toBe('PENDING');
    expect(result.paymentMethod).toBe('COD');
    expect(prisma.cartItem.deleteMany).toHaveBeenCalledWith({
      where: { cartId: 'cart-1' },
    });
    expect(outboxService.enqueue).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        eventType: 'checkout.completed',
        aggregateType: 'Checkout',
        aggregateId: 'order-1',
      }),
    );
    expect(outboxService.enqueue).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        eventType: 'order.placed',
        aggregateType: 'Order',
        aggregateId: 'order-1',
      }),
    );
  });

  it('fails checkout when cart is empty', async () => {
    prisma.cart.findUnique.mockResolvedValue(null);

    await expect(service.createOrder('u1', {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('fails checkout when address details are missing', async () => {
    prisma.cart.findUnique.mockResolvedValue({
      id: 'cart-1',
      userId: 'u1',
      storeId: 'store-1',
      items: [{ inventoryId: 'inv-1', quantity: 1 }],
    });
    inventoryService.buildCheckoutQuote.mockResolvedValue({
      total: 200,
      items: [
        {
          inventoryId: 'inv-1',
          variantId: 'var-1',
          quantity: 1,
          price: 200,
        },
      ],
    });
    prisma.address.findFirst.mockResolvedValue(null);

    await expect(service.createOrder('u1', {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
