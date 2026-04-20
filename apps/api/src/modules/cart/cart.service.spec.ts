import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from 'database';
import { CartService } from './cart.service';

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

    prisma.$transaction.mockImplementation((cb: (tx: unknown) => unknown) => cb(prisma));

    const moduleRef = await Test.createTestingModule({
      providers: [
        CartService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = moduleRef.get(CartService);
  });

  it('adds item to cart when stock is available', async () => {
    prisma.inventory.findFirst.mockResolvedValue({ id: 'inv-1', storeId: 'store-1' });
    prisma.cart.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'cart-1',
        store: { id: 'store-1', name: 'Main', city: 'Lahore', country: 'PK' },
        items: [],
      });
    prisma.cart.create.mockResolvedValue({ id: 'cart-1', userId: 'u1', storeId: 'store-1' });
    prisma.cartItem.findUnique.mockResolvedValue(null);
    prisma.$executeRaw.mockResolvedValue(1);

    await service.addItem('u1', { inventoryId: 'inv-1', quantity: 2 });

    expect(prisma.$executeRaw).toHaveBeenCalled();
    expect(prisma.cartItem.create).toHaveBeenCalledWith({
      data: { cartId: 'cart-1', inventoryId: 'inv-1', quantity: 2 },
    });
  });

  it('throws when adding item from another store', async () => {
    prisma.inventory.findFirst.mockResolvedValue({ id: 'inv-1', storeId: 'store-2' });
    prisma.cart.findUnique.mockResolvedValue({ id: 'cart-1', userId: 'u1', storeId: 'store-1' });

    await expect(
      service.addItem('u1', { inventoryId: 'inv-1', quantity: 1 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws when stock reservation fails while adding', async () => {
    prisma.inventory.findFirst.mockResolvedValue({ id: 'inv-1', storeId: 'store-1' });
    prisma.cart.findUnique
      .mockResolvedValueOnce({ id: 'cart-1', userId: 'u1', storeId: 'store-1' })
      .mockResolvedValueOnce({
        id: 'cart-1',
        store: { id: 'store-1', name: 'Main', city: 'Lahore', country: 'PK' },
        items: [],
      });
    prisma.cartItem.findUnique.mockResolvedValue(null);
    prisma.$executeRaw.mockResolvedValue(0);

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
    prisma.cartItem.findUnique.mockResolvedValue({ id: 'item-1', quantity: 1, inventoryId: 'inv-1' });
    prisma.$executeRaw.mockResolvedValue(1);

    await service.updateItem('u1', { inventoryId: 'inv-1', quantity: 4 });

    expect(prisma.$executeRaw).toHaveBeenCalled();
    expect(prisma.cartItem.update).toHaveBeenCalledWith({
      where: { id: 'item-1' },
      data: { quantity: 4 },
    });
  });

  it('removes item and deletes empty cart', async () => {
    prisma.cart.findUnique
      .mockResolvedValueOnce({ id: 'cart-1', userId: 'u1', storeId: 'store-1' })
      .mockResolvedValueOnce(null);
    prisma.cartItem.findUnique.mockResolvedValue({ id: 'item-1', quantity: 2, inventoryId: 'inv-1' });
    prisma.inventory.updateMany.mockResolvedValue({ count: 1 });
    prisma.cartItem.count.mockResolvedValue(0);

    await service.removeItem('u1', 'inv-1');

    expect(prisma.inventory.updateMany).toHaveBeenCalled();
    expect(prisma.cart.delete).toHaveBeenCalledWith({ where: { id: 'cart-1' } });
  });

  it('creates order in pending status with COD and clears cart', async () => {
    prisma.cart.findUnique.mockResolvedValue({
      id: 'cart-1',
      userId: 'u1',
      storeId: 'store-1',
      items: [{ inventoryId: 'inv-1', quantity: 2 }],
    });
    prisma.inventory.findMany.mockResolvedValue([
      {
        id: 'inv-1',
        storeId: 'store-1',
        variantId: 'var-1',
        stockQty: 10,
        reservedQty: 5,
        storePrice: 300,
        variant: { price: 280, product: { id: 'p1', name: 'Phone' } },
      },
    ]);
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
    prisma.inventory.updateMany.mockResolvedValue({ count: 1 });
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

    expect(result.status).toBe('PENDING');
    expect(result.paymentMethod).toBe('COD');
    expect(prisma.cartItem.deleteMany).toHaveBeenCalledWith({ where: { cartId: 'cart-1' } });
  });

  it('fails checkout when cart is empty', async () => {
    prisma.cart.findUnique.mockResolvedValue(null);

    await expect(service.createOrder('u1', {})).rejects.toBeInstanceOf(BadRequestException);
  });

  it('fails checkout when address details are missing', async () => {
    prisma.cart.findUnique.mockResolvedValue({
      id: 'cart-1',
      userId: 'u1',
      storeId: 'store-1',
      items: [{ inventoryId: 'inv-1', quantity: 1 }],
    });
    prisma.inventory.findMany.mockResolvedValue([
      {
        id: 'inv-1',
        storeId: 'store-1',
        variantId: 'var-1',
        stockQty: 4,
        reservedQty: 1,
        storePrice: 200,
        variant: { price: 180, product: { id: 'p1', name: 'Phone' } },
      },
    ]);
    prisma.address.findFirst.mockResolvedValue(null);

    await expect(service.createOrder('u1', {})).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws not found when user requests another user order', async () => {
    prisma.order.findFirst.mockResolvedValue(null);

    await expect(service.getOrder('u1', 'order-1')).rejects.toBeInstanceOf(NotFoundException);
  });
});
