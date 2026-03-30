import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'database';
import { ListInventoryQueryDto } from './dto/list-inventory-query.dto';

interface InventoryListingRow {
  inventoryId: string;
  storeId: string;
  variantId: string;
  stockQty: number | string;
  reservedQty: number | string;
  availableQty: number | string;
  storePrice: number | string | null;
  storeCostPrice: number | string | null;
  storeMrp: number | string | null;
  updatedAt: Date;
  storeName: string;
  storeCity: string;
  storeCountry: string;
  storeTimezone: string;
  storeLatitude: number | null;
  storeLongitude: number | null;
  productId: string;
  productName: string;
  productDescription: string;
  productCategoryId: string;
  productCreatedAt: Date;
  variantSku: string;
  variantBarcode: string | null;
  variantColor: string | null;
  variantSize: string | null;
  variantWeight: number | null;
  variantWeightUnit: string | null;
  variantPrice: number | string;
  variantCostPrice: number | string;
  variantMrp: number | string | null;
  sortValue: Date | number | string;
}

interface InventoryCursor {
  sortValue: string | number | Date;
  id: string;
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

    const sortOrderSql = sortOrder === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`;

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

  private decodeCursor(cursor: string, sortBy: 'price' | 'date'): InventoryCursor {
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
