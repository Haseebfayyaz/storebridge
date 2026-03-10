import {
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'database';
import { ListProductsQueryDto } from './dto/list-products-query.dto';

interface ProductListRow {
  id: string;
  name: string;
  description: string;
  categoryId: string;
  taxClassId: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  minPrice: number | string | null;
  totalQuantity: number | string;
}

@Injectable()
export class ProductListingService {
  constructor(private readonly prisma: PrismaService) {}

  async listing(query: ListProductsQueryDto, tenantId: string | null) {
    if (!tenantId) {
      throw new ConflictException('Tenant context is required for listing');
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const filters: Prisma.Sql[] = [
      Prisma.sql`p."tenant_id" = ${tenantId}`,
      Prisma.sql`p."isDeleted" = false`,
    ];

    if (query.name?.trim()) {
      filters.push(Prisma.sql`p."name" ILIKE ${`%${query.name.trim()}%`}`);
    }

    if (query.categoryId?.trim()) {
      filters.push(Prisma.sql`p."categoryId" = ${query.categoryId.trim()}`);
    }

    const whereClause = Prisma.sql`WHERE ${Prisma.join(filters, ' AND ')}`;

    const sortBySql =
      query.sortBy === 'price'
        ? Prisma.sql`q."minPrice"`
        : query.sortBy === 'quantity'
          ? Prisma.sql`q."totalQuantity"`
          : Prisma.sql`q."createdAt"`;

    const sortOrderSql = query.sortOrder === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`;

    const rows = await this.prisma.$queryRaw<ProductListRow[]>(Prisma.sql`
      SELECT *
      FROM (
        SELECT
          p."id",
          p."name",
          p."description",
          p."categoryId",
          p."taxClassId",
          p."isActive",
          p."createdAt",
          p."updatedAt",
          MIN(pv."price") AS "minPrice",
          COALESCE(SUM(i."stockQty" - i."reservedQty"), 0) AS "totalQuantity"
        FROM "Product" p
        LEFT JOIN "ProductVariant" pv ON pv."productId" = p."id"
        LEFT JOIN "Inventory" i ON i."variantId" = pv."id" AND i."isDeleted" = false
        ${whereClause}
        GROUP BY p."id"
      ) q
      ORDER BY ${sortBySql} ${sortOrderSql}
      OFFSET ${skip}
      LIMIT ${limit}
    `);

    const countRows = await this.prisma.$queryRaw<Array<{ total: number | string }>>(
      Prisma.sql`
        SELECT COUNT(*)::int AS total
        FROM "Product" p
        ${whereClause}
      `,
    );

    const total = Number(countRows[0]?.total ?? 0);

    return {
      data: rows.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        categoryId: row.categoryId,
        taxClassId: row.taxClassId ?? null,
        isActive: row.isActive,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        minPrice: row.minPrice === null ? null : Number(row.minPrice),
        totalQuantity: Number(row.totalQuantity),
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      filters: {
        name: query.name ?? null,
        categoryId: query.categoryId ?? null,
        sortBy: query.sortBy ?? 'createdAt',
        sortOrder: query.sortOrder ?? 'desc',
      },
    };
  }
}
