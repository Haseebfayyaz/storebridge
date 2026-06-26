import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'database';
import { InventoryDetailRow } from './interfaces/inventory-detail-row.interface';
import { InventoryListingRow } from './interfaces/inventory-listing-row.interface';
import { ListInventoryQueryDto } from './dto/list-inventory-query.dto';

interface SimilarItemRow extends InventoryDetailRow {}

interface InventoryCursor {
  sortValue: string | number | Date;
  id: string;
}

export interface CheckoutCartItem {
  inventoryId: string;
  quantity: number;
}

export interface OrderRestockItem {
  variantId: string;
  quantity: number;
}

export interface CartInventoryRecord {
  id: string;
  storeId: string;
}

export interface CheckoutOrderItem {
  inventoryId: string;
  variantId: string;
  quantity: number;
  price: number;
}

export interface CheckoutQuote {
  total: number;
  items: CheckoutOrderItem[];
}

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  async listInventoryForBuyers(query: ListInventoryQueryDto) {
    const limit = Math.min(query.limit ?? 20, 100);
    const sortBy = query.sortBy ?? 'date';
    const sortOrder = query.sortOrder ?? 'desc';

    const sortValueSql =
      sortBy === 'price'
        ? Prisma.sql`COALESCE(i."storePrice", pv."price")`
        : Prisma.sql`p."createdAt"`;

    const sortOrderSql =
      sortOrder === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`;

    const filters: Prisma.Sql[] = [
      Prisma.sql`i."isDeleted" = false`,
      Prisma.sql`p."isDeleted" = false`,
      Prisma.sql`p."isActive" = true`,
      Prisma.sql`s."isDeleted" = false`,
      Prisma.sql`s."isActive" = true`,
    ];

    if (query.name?.trim()) {
      filters.push(Prisma.sql`p."name" ILIKE ${`%${query.name.trim()}%`}`);
    }

    if (query.categoryId?.trim()) {
      filters.push(Prisma.sql`p."categoryId" = ${query.categoryId.trim()}`);
    }

    if (query.storeId?.trim()) {
      filters.push(Prisma.sql`i."storeId" = ${query.storeId.trim()}`);
    }

    const cursor = query.cursor
      ? this.decodeCursor(query.cursor, sortBy)
      : null;

    if (cursor) {
      const cursorFilter =
        sortOrder === 'asc'
          ? Prisma.sql`(${sortValueSql} > ${cursor.sortValue} OR (${sortValueSql} = ${cursor.sortValue} AND i."id" > ${cursor.id}))`
          : Prisma.sql`(${sortValueSql} < ${cursor.sortValue} OR (${sortValueSql} = ${cursor.sortValue} AND i."id" < ${cursor.id}))`;
      filters.push(cursorFilter);
    }

    const whereClause = Prisma.sql`WHERE ${Prisma.join(filters, ' AND ')}`;

    const rows = await this.prisma.$queryRaw<InventoryListingRow[]>(Prisma.sql`
      SELECT
        i."id" as "inventoryId",
        i."storeId",
        i."variantId",
        i."stockQty",
        i."reservedQty",
        (i."stockQty" - i."reservedQty") as "availableQty",
        i."storePrice",
        i."storeCostPrice",
        i."storeMrp",
        i."updatedAt",
        s."name" as "storeName",
        s."city" as "storeCity",
        s."country" as "storeCountry",
        s."timezone" as "storeTimezone",
        s."latitude" as "storeLatitude",
        s."longitude" as "storeLongitude",
        p."id" as "productId",
        p."name" as "productName",
        p."description" as "productDescription",
        p."categoryId" as "productCategoryId",
        p."createdAt" as "productCreatedAt",
        pv."sku" as "variantSku",
        pv."barcode" as "variantBarcode",
        pv."color" as "variantColor",
        pv."size" as "variantSize",
        pv."weight" as "variantWeight",
        pv."weightUnit" as "variantWeightUnit",
        pv."price" as "variantPrice",
        pv."costPrice" as "variantCostPrice",
        pv."mrp" as "variantMrp",
        ${sortValueSql} as "sortValue"
      FROM "Inventory" i
      JOIN "Store" s ON s."id" = i."storeId"
      JOIN "ProductVariant" pv ON pv."id" = i."variantId"
      JOIN "Product" p ON p."id" = pv."productId"
      ${whereClause}
      ORDER BY ${sortValueSql} ${sortOrderSql}, i."id" ${sortOrderSql}
      LIMIT ${limit + 1}
    `);

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;

    const nextCursor = hasMore
      ? this.encodeCursor({
          sortValue: pageRows[pageRows.length - 1].sortValue,
          id: pageRows[pageRows.length - 1].inventoryId,
        })
      : null;

    return {
      data: pageRows.map((row) => {
        const price = Number(row.storePrice ?? row.variantPrice);
        const mrp = row.storeMrp ?? row.variantMrp;

        return {
          inventoryId: row.inventoryId,
          store: {
            id: row.storeId,
            name: row.storeName,
            city: row.storeCity,
            country: row.storeCountry,
            timezone: row.storeTimezone,
            latitude: row.storeLatitude,
            longitude: row.storeLongitude,
          },
          product: {
            id: row.productId,
            name: row.productName,
            description: row.productDescription,
            categoryId: row.productCategoryId,
            createdAt: row.productCreatedAt,
          },
          variant: {
            id: row.variantId,
            sku: row.variantSku,
            barcode: row.variantBarcode,
            color: row.variantColor,
            size: row.variantSize,
            weight: row.variantWeight,
            weightUnit: row.variantWeightUnit,
          },
          quantity: {
            stockQty: Number(row.stockQty),
            reservedQty: Number(row.reservedQty),
            availableQty: Number(row.availableQty),
          },
          pricing: {
            price,
            mrp: mrp === null ? null : Number(mrp),
            storePrice: row.storePrice === null ? null : Number(row.storePrice),
            storeMrp: row.storeMrp === null ? null : Number(row.storeMrp),
          },
          images: [],
        };
      }),
      pagination: {
        nextCursor,
        limit,
        sortBy,
        sortOrder,
      },
      filters: {
        name: query.name ?? null,
        categoryId: query.categoryId ?? null,
        storeId: query.storeId ?? null,
      },
    };
  }

  async getInventoryDetail(inventoryId: string) {
    const rows = await this.prisma.$queryRaw<InventoryDetailRow[]>(Prisma.sql`
      SELECT
        i."id" as "inventoryId",
        i."storeId",
        i."variantId",
        i."stockQty",
        i."reservedQty",
        (i."stockQty" - i."reservedQty") as "availableQty",
        i."storePrice",
        i."storeCostPrice",
        i."storeMrp",
        i."updatedAt",
        s."name" as "storeName",
        s."city" as "storeCity",
        s."country" as "storeCountry",
        s."timezone" as "storeTimezone",
        s."latitude" as "storeLatitude",
        s."longitude" as "storeLongitude",
        p."id" as "productId",
        p."name" as "productName",
        p."description" as "productDescription",
        p."categoryId" as "productCategoryId",
        p."createdAt" as "productCreatedAt",
        c."name" as "categoryName",
        c."slug" as "categorySlug",
        pv."sku" as "variantSku",
        pv."barcode" as "variantBarcode",
        pv."color" as "variantColor",
        pv."size" as "variantSize",
        pv."weight" as "variantWeight",
        pv."weightUnit" as "variantWeightUnit",
        pv."price" as "variantPrice",
        pv."costPrice" as "variantCostPrice",
        pv."mrp" as "variantMrp"
      FROM "Inventory" i
      JOIN "Store" s ON s."id" = i."storeId"
      JOIN "ProductVariant" pv ON pv."id" = i."variantId"
      JOIN "Product" p ON p."id" = pv."productId"
      JOIN "Category" c ON c."id" = p."categoryId"
      WHERE
        i."id" = ${inventoryId}
        AND i."isDeleted" = false
        AND p."isDeleted" = false
        AND p."isActive" = true
        AND s."isDeleted" = false
        AND s."isActive" = true
      LIMIT 1
    `);

    const row = rows[0];
    if (!row) {
      throw new NotFoundException('Inventory item not found');
    }

    const price = Number(row.storePrice ?? row.variantPrice);
    const mrp = row.storeMrp ?? row.variantMrp;

    return {
      inventoryId: row.inventoryId,
      store: {
        id: row.storeId,
        name: row.storeName,
        city: row.storeCity,
        country: row.storeCountry,
        timezone: row.storeTimezone,
        latitude: row.storeLatitude,
        longitude: row.storeLongitude,
      },
      product: {
        id: row.productId,
        name: row.productName,
        description: row.productDescription,
        category: {
          id: row.productCategoryId,
          name: row.categoryName,
          slug: row.categorySlug,
        },
        createdAt: row.productCreatedAt,
      },
      variant: {
        id: row.variantId,
        sku: row.variantSku,
        barcode: row.variantBarcode,
        color: row.variantColor,
        size: row.variantSize,
        weight: row.variantWeight,
        weightUnit: row.variantWeightUnit,
      },
      quantity: {
        stockQty: Number(row.stockQty),
        reservedQty: Number(row.reservedQty),
        availableQty: Number(row.availableQty),
      },
      pricing: {
        price,
        mrp: mrp === null ? null : Number(mrp),
        storePrice: row.storePrice === null ? null : Number(row.storePrice),
        storeMrp: row.storeMrp === null ? null : Number(row.storeMrp),
      },
      images: [],
    };
  }

  async getSimilarItemsByCategory(inventoryId: string) {
    const base = await this.getInventoryDetail(inventoryId);

    const rows = await this.prisma.$queryRaw<SimilarItemRow[]>(Prisma.sql`
      SELECT
        i."id" as "inventoryId",
        i."storeId",
        i."variantId",
        i."stockQty",
        i."reservedQty",
        (i."stockQty" - i."reservedQty") as "availableQty",
        i."storePrice",
        i."storeCostPrice",
        i."storeMrp",
        i."updatedAt",
        s."name" as "storeName",
        s."city" as "storeCity",
        s."country" as "storeCountry",
        s."timezone" as "storeTimezone",
        s."latitude" as "storeLatitude",
        s."longitude" as "storeLongitude",
        p."id" as "productId",
        p."name" as "productName",
        p."description" as "productDescription",
        p."categoryId" as "productCategoryId",
        p."createdAt" as "productCreatedAt",
        c."name" as "categoryName",
        c."slug" as "categorySlug",
        pv."sku" as "variantSku",
        pv."barcode" as "variantBarcode",
        pv."color" as "variantColor",
        pv."size" as "variantSize",
        pv."weight" as "variantWeight",
        pv."weightUnit" as "variantWeightUnit",
        pv."price" as "variantPrice",
        pv."costPrice" as "variantCostPrice",
        pv."mrp" as "variantMrp"
      FROM "Inventory" i
      JOIN "Store" s ON s."id" = i."storeId"
      JOIN "ProductVariant" pv ON pv."id" = i."variantId"
      JOIN "Product" p ON p."id" = pv."productId"
      JOIN "Category" c ON c."id" = p."categoryId"
      WHERE
        i."isDeleted" = false
        AND p."isDeleted" = false
        AND p."isActive" = true
        AND s."isDeleted" = false
        AND s."isActive" = true
        AND p."categoryId" = ${base.product.category.id}
        AND i."storeId" = ${base.store.id}
        AND p."id" <> ${base.product.id}
      ORDER BY p."createdAt" DESC, i."id" DESC
      LIMIT 5
    `);

    return rows.map((row) => {
      const price = Number(row.storePrice ?? row.variantPrice);
      const mrp = row.storeMrp ?? row.variantMrp;

      return {
        inventoryId: row.inventoryId,
        store: {
          id: row.storeId,
          name: row.storeName,
          city: row.storeCity,
          country: row.storeCountry,
          timezone: row.storeTimezone,
          latitude: row.storeLatitude,
          longitude: row.storeLongitude,
        },
        product: {
          id: row.productId,
          name: row.productName,
          description: row.productDescription,
          category: {
            id: row.productCategoryId,
            name: row.categoryName,
            slug: row.categorySlug,
          },
          createdAt: row.productCreatedAt,
        },
        variant: {
          id: row.variantId,
          sku: row.variantSku,
          barcode: row.variantBarcode,
          color: row.variantColor,
          size: row.variantSize,
          weight: row.variantWeight,
          weightUnit: row.variantWeightUnit,
        },
        quantity: {
          stockQty: Number(row.stockQty),
          reservedQty: Number(row.reservedQty),
          availableQty: Number(row.availableQty),
        },
        pricing: {
          price,
          mrp: mrp === null ? null : Number(mrp),
          storePrice: row.storePrice === null ? null : Number(row.storePrice),
          storeMrp: row.storeMrp === null ? null : Number(row.storeMrp),
        },
        images: [],
      };
    });
  }

  async buildCheckoutQuote(
    tx: Prisma.TransactionClient,
    storeId: string,
    items: CheckoutCartItem[],
  ): Promise<CheckoutQuote> {
    const inventoryRows = await tx.inventory.findMany({
      where: { id: { in: items.map((item) => item.inventoryId) } },
      select: {
        id: true,
        storeId: true,
        variantId: true,
        stockQty: true,
        reservedQty: true,
        storePrice: true,
        variant: {
          select: {
            price: true,
          },
        },
      },
    });

    if (inventoryRows.length !== items.length) {
      throw new BadRequestException('Some cart items are invalid');
    }

    const inventoryById = new Map(inventoryRows.map((row) => [row.id, row]));
    let total = 0;
    const orderItems: CheckoutOrderItem[] = [];

    for (const item of items) {
      const inventory = inventoryById.get(item.inventoryId);
      if (!inventory) {
        throw new BadRequestException('Cart item no longer available');
      }

      if (inventory.storeId !== storeId) {
        throw new BadRequestException('Cart contains invalid store items');
      }

      if (
        inventory.reservedQty < item.quantity ||
        inventory.stockQty < item.quantity
      ) {
        throw new BadRequestException('Insufficient stock for checkout');
      }

      const price = inventory.storePrice ?? inventory.variant.price;
      total += price * item.quantity;
      orderItems.push({
        inventoryId: inventory.id,
        variantId: inventory.variantId,
        quantity: item.quantity,
        price,
      });
    }

    return { total, items: orderItems };
  }

  async getCartInventoryRecord(
    tx: Prisma.TransactionClient,
    inventoryId: string,
  ): Promise<CartInventoryRecord> {
    const inventory = await tx.inventory.findFirst({
      where: { id: inventoryId, isDeleted: false },
      select: { id: true, storeId: true },
    });

    if (!inventory) {
      throw new NotFoundException('Inventory item not found');
    }

    return inventory;
  }

  async captureCheckoutStock(
    tx: Prisma.TransactionClient,
    items: CheckoutCartItem[],
  ) {
    for (const item of items) {
      const stockUpdate = await tx.inventory.updateMany({
        where: {
          id: item.inventoryId,
          stockQty: { gte: item.quantity },
          reservedQty: { gte: item.quantity },
        },
        data: {
          stockQty: { decrement: item.quantity },
          reservedQty: { decrement: item.quantity },
        },
      });

      if (stockUpdate.count === 0) {
        throw new BadRequestException(
          'Stock changed during checkout, please review cart and retry',
        );
      }
    }
  }

  async restoreOrderStock(
    tx: Prisma.TransactionClient,
    storeId: string,
    items: OrderRestockItem[],
  ) {
    for (const item of items) {
      const stockUpdate = await tx.inventory.updateMany({
        where: {
          storeId,
          variantId: item.variantId,
          isDeleted: false,
        },
        data: {
          stockQty: { increment: item.quantity },
        },
      });

      if (stockUpdate.count === 0) {
        throw new BadRequestException(
          'Failed to restore stock for cancelled order',
        );
      }
    }
  }

  async reserveStock(
    tx: Prisma.TransactionClient,
    inventoryId: string,
    quantity: number,
  ) {
    const inventoryUpdate = await tx.$executeRaw(Prisma.sql`
      UPDATE "Inventory"
      SET "reservedQty" = "reservedQty" + ${quantity}
      WHERE "id" = ${inventoryId}
        AND "isDeleted" = false
        AND ("stockQty" - "reservedQty") >= ${quantity}
    `);

    if (inventoryUpdate === 0) {
      throw new BadRequestException('Requested quantity is out of stock');
    }
  }

  async releaseStock(
    tx: Prisma.TransactionClient,
    inventoryId: string,
    quantity: number,
  ) {
    const releaseUpdate = await tx.inventory.updateMany({
      where: { id: inventoryId, reservedQty: { gte: quantity } },
      data: { reservedQty: { decrement: quantity } },
    });

    if (releaseUpdate.count === 0) {
      throw new BadRequestException('Failed to release reserved stock');
    }
  }

  private decodeCursor(
    cursor: string,
    sortBy: 'price' | 'date',
  ): InventoryCursor {
    try {
      const decoded = Buffer.from(cursor, 'base64').toString('utf8');
      const parsed = JSON.parse(decoded) as InventoryCursor;
      if (!parsed?.id || parsed.sortValue === undefined) {
        throw new Error('Invalid cursor shape');
      }
      if (sortBy === 'date') {
        return {
          id: String(parsed.id),
          sortValue: new Date(parsed.sortValue),
        };
      }
      return { id: String(parsed.id), sortValue: Number(parsed.sortValue) };
    } catch (error) {
      throw new BadRequestException('Invalid cursor');
    }
  }

  private encodeCursor(cursor: InventoryCursor) {
    return Buffer.from(JSON.stringify(cursor)).toString('base64');
  }
}
