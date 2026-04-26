import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from 'database';
import { InventoryService } from './inventory.service';

describe('InventoryService', () => {
  let service: InventoryService;
  let prisma: {
    $queryRaw: jest.Mock;
  };

  const encodeCursor = (cursor: { sortValue: string | number | Date; id: string }) =>
    Buffer.from(
      JSON.stringify({
        ...cursor,
        sortValue:
          cursor.sortValue instanceof Date ? cursor.sortValue.toISOString() : cursor.sortValue,
      }),
    ).toString('base64');

  const decodeCursor = (cursor: string) =>
    JSON.parse(Buffer.from(cursor, 'base64').toString('utf8')) as {
      sortValue: string | number;
      id: string;
    };

  const makeListingRow = (overrides: Partial<Record<string, unknown>> = {}) => ({
    inventoryId: 'inv-1',
    storeId: 'store-1',
    variantId: 'variant-1',
    stockQty: '12',
    reservedQty: '2',
    availableQty: '10',
    storePrice: null,
    storeCostPrice: null,
    storeMrp: null,
    updatedAt: new Date('2026-01-01T10:00:00.000Z'),
    storeName: 'Main Store',
    storeCity: 'Lahore',
    storeCountry: 'PK',
    storeTimezone: 'Asia/Karachi',
    storeLatitude: 31.5204,
    storeLongitude: 74.3587,
    productId: 'product-1',
    productName: 'Running Shoe',
    productDescription: 'Lightweight running shoe',
    productCategoryId: 'category-1',
    productCreatedAt: new Date('2026-01-01T09:00:00.000Z'),
    variantSku: 'SKU-1',
    variantBarcode: 'BAR-1',
    variantColor: 'Black',
    variantSize: '42',
    variantWeight: 1.2,
    variantWeightUnit: 'kg',
    variantPrice: '129.50',
    variantCostPrice: '90.00',
    variantMrp: '149.00',
    sortValue: new Date('2026-01-01T10:00:00.000Z'),
    ...overrides,
  });

  const makeDetailRow = (overrides: Partial<Record<string, unknown>> = {}) => ({
    inventoryId: 'inv-1',
    storeId: 'store-1',
    variantId: 'variant-1',
    stockQty: '12',
    reservedQty: '2',
    availableQty: '10',
    storePrice: null,
    storeCostPrice: null,
    storeMrp: null,
    updatedAt: new Date('2026-01-01T10:00:00.000Z'),
    storeName: 'Main Store',
    storeCity: 'Lahore',
    storeCountry: 'PK',
    storeTimezone: 'Asia/Karachi',
    storeLatitude: 31.5204,
    storeLongitude: 74.3587,
    productId: 'product-1',
    productName: 'Running Shoe',
    productDescription: 'Lightweight running shoe',
    productCategoryId: 'category-1',
    productCreatedAt: new Date('2026-01-01T09:00:00.000Z'),
    categoryName: 'Footwear',
    categorySlug: 'footwear',
    variantSku: 'SKU-1',
    variantBarcode: 'BAR-1',
    variantColor: 'Black',
    variantSize: '42',
    variantWeight: 1.2,
    variantWeightUnit: 'kg',
    variantPrice: '129.50',
    variantCostPrice: '90.00',
    variantMrp: '149.00',
    ...overrides,
  });

  beforeEach(async () => {
    prisma = {
      $queryRaw: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        InventoryService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = moduleRef.get(InventoryService);
  });

  it('lists inventory for buyers with capped limit, price sorting, cursor filtering, and pagination', async () => {
    const cursor = encodeCursor({ sortValue: 150, id: 'inv-0' });
    prisma.$queryRaw.mockResolvedValue([
      makeListingRow({
        inventoryId: 'inv-2',
        storePrice: null,
        variantPrice: '120.50',
        storeMrp: '135.00',
        variantMrp: '149.00',
        sortValue: '120.50',
      }),
      makeListingRow({
        inventoryId: 'inv-3',
        storePrice: '140.00',
        variantPrice: '150.00',
        sortValue: '140.00',
      }),
    ]);

    const result = await service.listInventoryForBuyers({
      limit: 1,
      sortBy: 'price',
      sortOrder: 'asc',
      cursor,
      name: '  Shoe  ',
      categoryId: 'category-1',
      storeId: 'store-1',
    });

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);

    const query = prisma.$queryRaw.mock.calls[0][0] as {
      strings: string[];
      values: unknown[];
    };

    expect(query.strings.join('')).toContain('COALESCE(i."storePrice", pv."price")');
    expect(query.strings.join('')).toContain('p."name" ILIKE');
    expect(query.strings.join('')).toContain('p."categoryId" =');
    expect(query.strings.join('')).toContain('i."storeId" =');
    expect(query.strings.join('')).toContain('ORDER BY COALESCE(i."storePrice", pv."price") ASC, i."id" ASC');
    expect(query.values).toEqual(
      expect.arrayContaining(['%Shoe%', 'category-1', 'store-1', 150, 'inv-0', 2]),
    );

    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      inventoryId: 'inv-2',
      store: {
        id: 'store-1',
        name: 'Main Store',
        city: 'Lahore',
        country: 'PK',
      },
      product: {
        id: 'product-1',
        name: 'Running Shoe',
        description: 'Lightweight running shoe',
        categoryId: 'category-1',
      },
      variant: {
        id: 'variant-1',
        sku: 'SKU-1',
        barcode: 'BAR-1',
      },
      quantity: {
        stockQty: 12,
        reservedQty: 2,
        availableQty: 10,
      },
      pricing: {
        price: 120.5,
        mrp: 135,
        storePrice: null,
        storeMrp: 135,
      },
      images: [],
    });

    expect(result.pagination).toEqual({
      nextCursor: expect.any(String),
      limit: 1,
      sortBy: 'price',
      sortOrder: 'asc',
    });

    expect(decodeCursor(result.pagination.nextCursor as string)).toEqual({
      sortValue: '120.50',
      id: 'inv-2',
    });
    expect(result.filters).toEqual({
      name: '  Shoe  ',
      categoryId: 'category-1',
      storeId: 'store-1',
    });
  });

  it('caps buyer listing limit at 100', async () => {
    prisma.$queryRaw.mockResolvedValue([makeListingRow()]);

    await service.listInventoryForBuyers({
      limit: 250,
    });

    const query = prisma.$queryRaw.mock.calls[0][0] as {
      strings: string[];
      values: unknown[];
    };

    expect(query.values.at(-1)).toBe(101);
  });

  it('returns detail data and throws when inventory does not exist', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([makeDetailRow()]);

    await expect(service.getInventoryDetail('inv-1')).resolves.toMatchObject({
      inventoryId: 'inv-1',
      store: {
        id: 'store-1',
        name: 'Main Store',
        city: 'Lahore',
        country: 'PK',
      },
      product: {
        id: 'product-1',
        name: 'Running Shoe',
        description: 'Lightweight running shoe',
        category: {
          id: 'category-1',
          name: 'Footwear',
          slug: 'footwear',
        },
      },
      pricing: {
        price: 129.5,
        mrp: 149,
        storePrice: null,
        storeMrp: null,
      },
    });

    prisma.$queryRaw.mockResolvedValueOnce([]);

    await expect(service.getInventoryDetail('missing-inventory')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('returns similar items for the same category and store', async () => {
    jest.spyOn(service, 'getInventoryDetail').mockResolvedValue({
      inventoryId: 'inv-1',
      store: { id: 'store-1', name: 'Main Store', city: 'Lahore', country: 'PK' },
      product: {
        id: 'product-1',
        name: 'Running Shoe',
        description: 'Lightweight running shoe',
        category: {
          id: 'category-1',
          name: 'Footwear',
          slug: 'footwear',
        },
      },
      variant: {
        id: 'variant-1',
        sku: 'SKU-1',
        barcode: 'BAR-1',
        color: 'Black',
        size: '42',
        weight: 1.2,
        weightUnit: 'kg',
      },
      quantity: {
        stockQty: 12,
        reservedQty: 2,
        availableQty: 10,
      },
      pricing: {
        price: 129.5,
        mrp: 149,
        storePrice: null,
        storeMrp: null,
      },
      images: [],
    } as never);

    prisma.$queryRaw.mockResolvedValue([
      makeDetailRow({
        inventoryId: 'inv-2',
        productId: 'product-2',
        productName: 'Walking Shoe',
        productDescription: 'Comfort walking shoe',
        variantSku: 'SKU-2',
        variantPrice: '99.00',
        variantMrp: '119.00',
      }),
    ]);

    const result = await service.getSimilarItemsByCategory('inv-1');

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      inventoryId: 'inv-2',
      product: {
        id: 'product-2',
        name: 'Walking Shoe',
        description: 'Comfort walking shoe',
        category: {
          id: 'category-1',
          name: 'Footwear',
          slug: 'footwear',
        },
      },
      variant: {
        sku: 'SKU-2',
      },
      pricing: {
        price: 99,
        mrp: 119,
        storePrice: null,
        storeMrp: null,
      },
      images: [],
    });
  });

  it('rejects malformed cursors', async () => {
    prisma.$queryRaw.mockResolvedValue([]);

    await expect(
      service.listInventoryForBuyers({
        cursor: 'not-a-valid-base64-cursor',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
