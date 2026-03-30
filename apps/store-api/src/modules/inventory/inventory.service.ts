import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Inventory, Prisma } from '@prisma/client';
import { PrismaService } from 'database';
import { ElasticsearchService } from '../elasticsearch/elasticsearch.service';
import { ProductService, VariantProductContext } from '../product/product.service';
import { CreateInventoryDto } from './dto/create-inventory.dto';
import { ListInventoryQueryDto } from './dto/list-inventory-query.dto';
import { UpdateInventoryDto } from './dto/update-inventory.dto';
import { InventoryAction } from './interfaces/inventory-action.enum';
import { InventoryWithPricing } from './interfaces/inventory-with-pricing.interface';
import { OrderStockItem } from './interfaces/order-stock-item.interface';

interface StockMutationResult {
  id: string;
  storeId: string;
  variantId: string;
  previousStock: number;
  newStock: number;
}

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
  private readonly logger = new Logger(InventoryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly elasticService: ElasticsearchService,
    private readonly productService: ProductService,
  ) {}

  async createInventory(
    dto: CreateInventoryDto,
    changedBy?: string,
    actorTenantId?: string | null,
  ): Promise<Inventory> {
    await this.assertInventoryDependencies(
      dto.storeId,
      dto.variantId,
      dto.productId,
      actorTenantId,
    );

    const existing = await this.prisma.inventory.findUnique({
      where: {
        storeId_variantId: {
          storeId: dto.storeId,
          variantId: dto.variantId,
        },
      },
    });

    const stockQty = dto.stockQty ?? 0;
    const reservedQty = dto.reservedQty ?? 0;
    if (reservedQty > stockQty) {
      throw new ConflictException('reservedQty cannot be greater than stockQty');
    }

    let inventory: Inventory;
    if (existing && !existing.isDeleted) {
      throw new ConflictException(
        'Inventory already exists for this store and variant',
      );
    }

    if (existing?.isDeleted) {
      inventory = await this.prisma.inventory.update({
        where: { id: existing.id },
        data: {
          isDeleted: false,
          stockQty,
          reservedQty,
          lowStock: dto.lowStock ?? existing.lowStock,
          storePrice: dto.storePrice,
          storeCostPrice: dto.storeCostPrice,
          storeMrp: dto.storeMrp,
        },
      });
    } else {
      inventory = await this.prisma.inventory.create({
        data: {
          storeId: dto.storeId,
          variantId: dto.variantId,
          stockQty,
          reservedQty,
          lowStock: dto.lowStock ?? 5,
          storePrice: dto.storePrice,
          storeCostPrice: dto.storeCostPrice,
          storeMrp: dto.storeMrp,
        },
      });
    }

    await this.logChange({
      inventory,
      action: InventoryAction.CREATE,
      previousStock: existing?.stockQty ?? 0,
      newStock: inventory.stockQty,
      changedBy,
    });

    return inventory;
  }

  async findOne(id: string): Promise<Inventory> {
    const inventory = await this.prisma.inventory.findUnique({ where: { id } });

    if (!inventory || inventory.isDeleted) {
      throw new NotFoundException(`Inventory with id "${id}" not found`);
    }

    return inventory;
  }

  async getInventoryWithPricing(id: string): Promise<InventoryWithPricing> {
    const inventory = await this.prisma.inventory.findUnique({
      where: { id },
      include: {
        variant: {
          include: {
            product: {
              select: {
                id: true,
                tenantId: true,
              },
            },
          },
        },
      },
    });

    if (!inventory || inventory.isDeleted) {
      throw new NotFoundException(`Inventory with id "${id}" not found`);
    }

    return this.mapInventoryWithPricing(inventory);
  }

  async getStoreVariantInventoryWithPricing(
    storeId: string,
    variantId: string,
  ): Promise<InventoryWithPricing> {
    const inventory = await this.prisma.inventory.findUnique({
      where: {
        storeId_variantId: {
          storeId,
          variantId,
        },
      },
      include: {
        variant: {
          include: {
            product: {
              select: {
                id: true,
                tenantId: true,
              },
            },
          },
        },
      },
    });

    if (!inventory || inventory.isDeleted) {
      throw new NotFoundException(
        `Inventory not found for storeId="${storeId}" and variantId="${variantId}"`,
      );
    }

    return this.mapInventoryWithPricing(inventory);
  }

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

  async updateStock(
    id: string,
    dto: UpdateInventoryDto,
    changedBy?: string,
  ): Promise<Inventory> {
    const current = await this.findOne(id);

    const targetStockQty = dto.stockQty ?? current.stockQty;
    const targetReservedQty = dto.reservedQty ?? current.reservedQty;

    if (targetReservedQty > targetStockQty) {
      throw new ConflictException('reservedQty cannot be greater than stockQty');
    }

    const updated = await this.prisma.inventory.update({
      where: { id },
      data: {
        ...(dto.stockQty !== undefined ? { stockQty: dto.stockQty } : {}),
        ...(dto.reservedQty !== undefined ? { reservedQty: dto.reservedQty } : {}),
        ...(dto.lowStock !== undefined ? { lowStock: dto.lowStock } : {}),
        ...(dto.storePrice !== undefined ? { storePrice: dto.storePrice } : {}),
        ...(dto.storeCostPrice !== undefined
          ? { storeCostPrice: dto.storeCostPrice }
          : {}),
        ...(dto.storeMrp !== undefined ? { storeMrp: dto.storeMrp } : {}),
      },
    });

    await this.logChange({
      inventory: updated,
      action: InventoryAction.UPDATE,
      previousStock: current.stockQty,
      newStock: updated.stockQty,
      changedBy,
    });

    return updated;
  }

  async softDeleteInventory(id: string, changedBy?: string): Promise<Inventory> {
    const current = await this.findOne(id);

    const deleted = await this.prisma.inventory.update({
      where: { id },
      data: { isDeleted: true },
    });

    await this.logChange({
      inventory: deleted,
      action: InventoryAction.DELETE,
      previousStock: current.stockQty,
      newStock: deleted.stockQty,
      changedBy,
    });

    return deleted;
  }

  async reserveStock(
    inventoryId: string,
    quantity: number,
    changedBy?: string,
  ): Promise<Inventory> {
    if (quantity <= 0) {
      throw new ConflictException('quantity must be greater than 0');
    }

    const mutation = await this.prisma.$transaction(async (tx) =>
      this.reserveStockAtomic(tx, inventoryId, quantity),
    );

    const updated = await this.findOne(mutation.id);

    await this.logChange({
      inventory: updated,
      action: InventoryAction.RESERVE,
      previousStock: mutation.previousStock,
      newStock: mutation.newStock,
      changedBy,
    });

    return updated;
  }

  async releaseReservedStock(
    inventoryId: string,
    quantity: number,
    changedBy?: string,
  ): Promise<Inventory> {
    if (quantity <= 0) {
      throw new ConflictException('quantity must be greater than 0');
    }

    const mutation = await this.prisma.$transaction(async (tx) =>
      this.releaseStockAtomic(tx, inventoryId, quantity),
    );

    const updated = await this.findOne(mutation.id);

    await this.logChange({
      inventory: updated,
      action: InventoryAction.RELEASE,
      previousStock: mutation.previousStock,
      newStock: mutation.newStock,
      changedBy,
    });

    return updated;
  }

  async deductStock(params: {
    storeId: string;
    variantId: string;
    quantity: number;
    changedBy?: string;
    tx?: Prisma.TransactionClient;
  }): Promise<Inventory> {
    if (params.quantity <= 0) {
      throw new ConflictException('quantity must be greater than 0');
    }

    const execDeduction = async (
      tx: Prisma.TransactionClient,
    ): Promise<StockMutationResult> =>
      this.deductByStoreAndVariantAtomic(
        tx,
        params.storeId,
        params.variantId,
        params.quantity,
      );

    const mutation = params.tx
      ? await execDeduction(params.tx)
      : await this.prisma.$transaction(execDeduction);

    const updated = await this.findOne(mutation.id);

    await this.logChange({
      inventory: updated,
      action: InventoryAction.DEDUCT,
      previousStock: mutation.previousStock,
      newStock: mutation.newStock,
      changedBy: params.changedBy,
    });

    return updated;
  }

  async deductStockForOrderItems(params: {
    storeId: string;
    items: OrderStockItem[];
    changedBy?: string;
    tx?: Prisma.TransactionClient;
  }): Promise<Inventory[]> {
    const sortedItems = [...params.items].sort((a, b) =>
      a.variantId.localeCompare(b.variantId),
    );

    const execute = async (tx: Prisma.TransactionClient): Promise<Inventory[]> => {
      const updates: Inventory[] = [];

      for (const item of sortedItems) {
        const updated = await this.deductStock({
          storeId: params.storeId,
          variantId: item.variantId,
          quantity: item.quantity,
          changedBy: params.changedBy,
          tx,
        });

        updates.push(updated);
      }

      return updates;
    };

    if (params.tx) {
      return execute(params.tx);
    }

    return this.prisma.$transaction((tx) => execute(tx));
  }

  private async reserveStockAtomic(
    tx: Prisma.TransactionClient,
    inventoryId: string,
    quantity: number,
  ): Promise<StockMutationResult> {
    const rows = await tx.$queryRaw<StockMutationResult[]>(Prisma.sql`
      UPDATE "Inventory"
      SET "reservedQty" = "reservedQty" + ${quantity},
          "updatedAt" = NOW()
      WHERE "id" = ${inventoryId}
        AND "isDeleted" = false
        AND ("stockQty" - "reservedQty") >= ${quantity}
      RETURNING
        "id",
        "storeId",
        "variantId",
        "stockQty" AS "previousStock",
        "stockQty" AS "newStock"
    `);

    if (rows.length > 0) {
      return rows[0];
    }

    await this.throwIfInventoryMissing(tx, inventoryId);
    throw new ConflictException('Insufficient available stock to reserve');
  }

  private async releaseStockAtomic(
    tx: Prisma.TransactionClient,
    inventoryId: string,
    quantity: number,
  ): Promise<StockMutationResult> {
    const rows = await tx.$queryRaw<StockMutationResult[]>(Prisma.sql`
      UPDATE "Inventory"
      SET "reservedQty" = "reservedQty" - ${quantity},
          "updatedAt" = NOW()
      WHERE "id" = ${inventoryId}
        AND "isDeleted" = false
        AND "reservedQty" >= ${quantity}
      RETURNING
        "id",
        "storeId",
        "variantId",
        "stockQty" AS "previousStock",
        "stockQty" AS "newStock"
    `);

    if (rows.length > 0) {
      return rows[0];
    }

    await this.throwIfInventoryMissing(tx, inventoryId);
    throw new ConflictException('Cannot release more than reserved quantity');
  }

  private async deductByStoreAndVariantAtomic(
    tx: Prisma.TransactionClient,
    storeId: string,
    variantId: string,
    quantity: number,
  ): Promise<StockMutationResult> {
    const rows = await tx.$queryRaw<StockMutationResult[]>(Prisma.sql`
      UPDATE "Inventory"
      SET "stockQty" = "stockQty" - ${quantity},
          "updatedAt" = NOW()
      WHERE "storeId" = ${storeId}
        AND "variantId" = ${variantId}
        AND "isDeleted" = false
        AND ("stockQty" - "reservedQty") >= ${quantity}
      RETURNING
        "id",
        "storeId",
        "variantId",
        "stockQty" + ${quantity} AS "previousStock",
        "stockQty" AS "newStock"
    `);

    if (rows.length > 0) {
      return rows[0];
    }

    const inventory = await tx.inventory.findUnique({
      where: {
        storeId_variantId: {
          storeId,
          variantId,
        },
      },
    });

    if (!inventory || inventory.isDeleted) {
      throw new NotFoundException(
        `Inventory not found for storeId="${storeId}" and variantId="${variantId}"`,
      );
    }

    throw new ConflictException(
      `Insufficient available stock for variantId="${variantId}"`,
    );
  }

  private async throwIfInventoryMissing(
    tx: Prisma.TransactionClient,
    inventoryId: string,
  ): Promise<void> {
    const inventory = await tx.inventory.findUnique({
      where: { id: inventoryId },
      select: { id: true, isDeleted: true },
    });

    if (!inventory || inventory.isDeleted) {
      throw new NotFoundException(`Inventory with id "${inventoryId}" not found`);
    }
  }

  private async assertInventoryDependencies(
    storeId: string,
    variantId: string,
    productId: string,
    actorTenantId?: string | null,
  ): Promise<void> {
    const [store, variant] = await Promise.all([
      this.prisma.store.findFirst({
        where: { id: storeId, isDeleted: false, isActive: true },
        select: { tenantId: true },
      }),
      this.productService.findActiveVariantProductContext(variantId),
    ]);

    if (!store) {
      throw new NotFoundException(
        `Active store with id "${storeId}" was not found`,
      );
    }

    if (!variant) {
      throw new NotFoundException(
        `Active product variant with id "${variantId}" was not found`,
      );
    }

    if (store.tenantId !== variant.tenantId) {
      throw new ConflictException(
        'Store and product variant must belong to the same tenant',
      );
    }

    if (variant.productId !== productId) {
      throw new ConflictException(
        'Provided productId does not match the provided variantId',
      );
    }

    if (actorTenantId && actorTenantId !== variant.tenantId) {
      throw new ConflictException(
        'Cross-tenant inventory operation is not allowed',
      );
    }

  }

  private mapInventoryWithPricing(inventory: {
    id: string;
    storeId: string;
    variantId: string;
    stockQty: number;
    reservedQty: number;
    lowStock: number;
    isDeleted: boolean;
    storePrice: number | null;
    storeCostPrice: number | null;
    storeMrp: number | null;
    updatedAt: Date;
    variant: {
      price: number;
      costPrice: number;
      mrp: number | null;
      product: {
        id: string;
        tenantId: string;
      };
    };
  }): InventoryWithPricing {
    return {
      id: inventory.id,
      tenantId: inventory.variant.product.tenantId,
      storeId: inventory.storeId,
      productId: inventory.variant.product.id,
      variantId: inventory.variantId,
      stockQty: inventory.stockQty,
      reservedQty: inventory.reservedQty,
      availableQty: inventory.stockQty - inventory.reservedQty,
      lowStock: inventory.lowStock,
      isDeleted: inventory.isDeleted,
      price: inventory.storePrice ?? inventory.variant.price,
      costPrice: inventory.storeCostPrice ?? inventory.variant.costPrice,
      mrp: inventory.storeMrp ?? inventory.variant.mrp,
      storePrice: inventory.storePrice,
      storeCostPrice: inventory.storeCostPrice,
      storeMrp: inventory.storeMrp,
      updatedAt: inventory.updatedAt,
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

  private async logChange(params: {
    inventory: Inventory;
    action: InventoryAction;
    previousStock: number;
    newStock: number;
    changedBy?: string;
  }): Promise<void> {
    try {
      const context = await this.resolveLogContext(params.inventory.variantId);

      await this.elasticService.logInventoryChange({
        inventoryId: params.inventory.id,
        tenantId: context.tenantId,
        storeId: params.inventory.storeId,
        productId: context.productId,
        variantId: params.inventory.variantId,
        action: params.action,
        previousStock: params.previousStock,
        newStock: params.newStock,
        changedBy: params.changedBy,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.error(
        `Failed to prepare inventory log for inventoryId=${params.inventory.id}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  private async resolveLogContext(
    variantId: string,
  ): Promise<VariantProductContext> {
    const context =
      await this.productService.findVariantProductContextAnyState(variantId);

    if (!context) {
      throw new NotFoundException(
        `Product variant with id "${variantId}" not found for inventory logging`,
      );
    }

    return context;
  }
}
