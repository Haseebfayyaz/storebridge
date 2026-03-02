import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Inventory, Prisma, ProductVariant } from '@prisma/client';
import { PrismaService } from 'database';
import { ElasticsearchService } from '../elasticsearch/elasticsearch.service';
import { InventoryAction } from '../inventory/interfaces/inventory-action.enum';
import { CreateFullItemDto } from './dto/create-full-item.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { CreateProductVariantDto } from './dto/create-product-variant.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdateProductVariantDto } from './dto/update-product-variant.dto';

export interface VariantProductContext {
  variantId: string;
  productId: string;
  tenantId: string;
}

interface CreateFullItemUserContext {
  sub: string;
  tenantId: string | null;
}

@Injectable()
export class ProductService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly elasticService: ElasticsearchService,
  ) {}

  async createProduct(dto: CreateProductDto, tenantId: string | null) {
    const scopedTenantId = this.requireTenant(tenantId);
    await this.ensureCategoryBelongsToTenant(scopedTenantId, dto.categoryId);
    await this.ensureTaxClassBelongsToTenant(scopedTenantId, dto.taxClassId);

    return this.prisma.product.create({
      data: {
        tenantId: scopedTenantId,
        name: dto.name,
        description: dto.description,
        categoryId: dto.categoryId,
        taxClassId: dto.taxClassId,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async updateProduct(
    productId: string,
    dto: UpdateProductDto,
    tenantId: string | null,
  ) {
    const scopedTenantId = this.requireTenant(tenantId);
    const product = await this.prisma.product.findFirst({
      where: { id: productId, tenantId: scopedTenantId, isDeleted: false },
      select: { id: true },
    });

    if (!product) {
      throw new NotFoundException(`Product with id "${productId}" not found`);
    }

    if (dto.categoryId) {
      await this.ensureCategoryBelongsToTenant(scopedTenantId, dto.categoryId);
    }

    if (dto.taxClassId !== undefined) {
      await this.ensureTaxClassBelongsToTenant(scopedTenantId, dto.taxClassId);
    }

    return this.prisma.product.update({
      where: { id: productId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId } : {}),
        ...(dto.taxClassId !== undefined ? { taxClassId: dto.taxClassId } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }

  async createVariant(
    productId: string,
    dto: CreateProductVariantDto,
    tenantId: string | null,
  ) {
    const scopedTenantId = this.requireTenant(tenantId);

    const product = await this.prisma.product.findFirst({
      where: {
        id: productId,
        tenantId: scopedTenantId,
        isDeleted: false,
        isActive: true,
      },
      select: { id: true },
    });

    if (!product) {
      throw new NotFoundException(
        `Active product with id "${productId}" not found`,
      );
    }

    return this.prisma.productVariant.create({
      data: {
        productId,
        sku: dto.sku,
        barcode: dto.barcode,
        color: dto.color,
        size: dto.size,
        weight: dto.weight,
        weightUnit: dto.weightUnit,
        price: dto.price,
        costPrice: dto.costPrice,
        mrp: dto.mrp,
      },
    });
  }

  async updateVariant(
    variantId: string,
    dto: UpdateProductVariantDto,
    tenantId: string | null,
  ) {
    const scopedTenantId = this.requireTenant(tenantId);

    const variant = await this.prisma.productVariant.findFirst({
      where: {
        id: variantId,
        product: {
          tenantId: scopedTenantId,
          isDeleted: false,
        },
      },
      select: { id: true },
    });

    if (!variant) {
      throw new NotFoundException(`Variant with id "${variantId}" not found`);
    }

    return this.prisma.productVariant.update({
      where: { id: variantId },
      data: {
        ...(dto.sku !== undefined ? { sku: dto.sku } : {}),
        ...(dto.barcode !== undefined ? { barcode: dto.barcode } : {}),
        ...(dto.color !== undefined ? { color: dto.color } : {}),
        ...(dto.size !== undefined ? { size: dto.size } : {}),
        ...(dto.weight !== undefined ? { weight: dto.weight } : {}),
        ...(dto.weightUnit !== undefined ? { weightUnit: dto.weightUnit } : {}),
        ...(dto.price !== undefined ? { price: dto.price } : {}),
        ...(dto.costPrice !== undefined ? { costPrice: dto.costPrice } : {}),
        ...(dto.mrp !== undefined ? { mrp: dto.mrp } : {}),
      },
    });
  }

  async createFullItem(dto: CreateFullItemDto, user: CreateFullItemUserContext) {
    const tenantId = this.requireTenant(user.tenantId);

    await this.ensureCategoryBelongsToTenant(tenantId, dto.product.categoryId);
    await this.ensureTaxClassBelongsToTenant(tenantId, dto.product.taxClassId);

    const storeIds = new Set<string>();
    for (const variant of dto.variants) {
      for (const inventory of variant.inventories ?? []) {
        if ((inventory.reservedQty ?? 0) > (inventory.stockQty ?? 0)) {
          throw new BadRequestException(
            'reservedQty cannot be greater than stockQty',
          );
        }
        storeIds.add(inventory.storeId);
      }
    }

    const stores = storeIds.size
      ? await this.prisma.store.findMany({
          where: { id: { in: [...storeIds] }, isDeleted: false, isActive: true },
          select: { id: true, tenantId: true },
        })
      : [];

    const storeMap = new Map(stores.map((store) => [store.id, store]));
    for (const storeId of storeIds) {
      const store = storeMap.get(storeId);
      if (!store) {
        throw new NotFoundException(`Active store with id "${storeId}" not found`);
      }
      if (store.tenantId !== tenantId) {
        throw new ConflictException(
          `Store "${storeId}" belongs to a different tenant`,
        );
      }
    }

    const logs: Array<{
      inventoryId: string;
      storeId: string;
      productId: string;
      variantId: string;
      previousStock: number;
      newStock: number;
    }> = [];

    const result = await this.prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          tenantId,
          name: dto.product.name,
          description: dto.product.description,
          categoryId: dto.product.categoryId,
          taxClassId: dto.product.taxClassId,
          isActive: dto.product.isActive ?? true,
        },
      });

      const createdVariants: Array<ProductVariant & { inventories: Inventory[] }> =
        [];

      for (const variantInput of dto.variants) {
        const variant = await tx.productVariant.create({
          data: {
            productId: product.id,
            sku: variantInput.sku,
            barcode: variantInput.barcode,
            color: variantInput.color,
            size: variantInput.size,
            weight: variantInput.weight,
            weightUnit: variantInput.weightUnit,
            price: variantInput.price,
            costPrice: variantInput.costPrice,
            mrp: variantInput.mrp,
          },
        });

        const createdInventories: Inventory[] = [];
        for (const inventoryInput of variantInput.inventories ?? []) {
          const inventory = await tx.inventory.create({
            data: {
              storeId: inventoryInput.storeId,
              variantId: variant.id,
              stockQty: inventoryInput.stockQty ?? 0,
              reservedQty: inventoryInput.reservedQty ?? 0,
              lowStock: inventoryInput.lowStock ?? 5,
              storePrice: inventoryInput.storePrice,
              storeCostPrice: inventoryInput.storeCostPrice,
              storeMrp: inventoryInput.storeMrp,
            },
          });

          logs.push({
            inventoryId: inventory.id,
            storeId: inventory.storeId,
            productId: product.id,
            variantId: variant.id,
            previousStock: 0,
            newStock: inventory.stockQty,
          });

          createdInventories.push(inventory);
        }

        createdVariants.push({ ...variant, inventories: createdInventories });
      }

      return { product, variants: createdVariants };
    });

    for (const log of logs) {
      await this.elasticService.logInventoryChange({
        inventoryId: log.inventoryId,
        tenantId,
        storeId: log.storeId,
        productId: log.productId,
        variantId: log.variantId,
        action: InventoryAction.CREATE,
        previousStock: log.previousStock,
        newStock: log.newStock,
        changedBy: user.sub,
        timestamp: new Date().toISOString(),
      });
    }

    return result;
  }

  async findActiveVariantProductContext(
    variantId: string,
  ): Promise<VariantProductContext | null> {
    return this.findVariantProductContext(variantId, true);
  }

  async findVariantProductContextAnyState(
    variantId: string,
  ): Promise<VariantProductContext | null> {
    return this.findVariantProductContext(variantId, false);
  }

  private async findVariantProductContext(
    variantId: string,
    onlyActiveProducts: boolean,
  ): Promise<VariantProductContext | null> {
    const variant = await this.prisma.productVariant.findFirst({
      where: {
        id: variantId,
        ...(onlyActiveProducts
          ? {
              product: {
                isDeleted: false,
                isActive: true,
              },
            }
          : {}),
      },
      select: {
        id: true,
        product: {
          select: {
            id: true,
            tenantId: true,
          },
        },
      },
    });

    if (!variant) {
      return null;
    }

    return {
      variantId: variant.id,
      productId: variant.product.id,
      tenantId: variant.product.tenantId,
    };
  }

  private requireTenant(tenantId: string | null): string {
    if (!tenantId) {
      throw new ConflictException('Tenant context is required for this operation');
    }

    return tenantId;
  }

  private async ensureCategoryBelongsToTenant(
    tenantId: string,
    categoryId: string,
  ): Promise<void> {
    const category = await this.prisma.category.findFirst({
      where: {
        id: categoryId,
        tenantId,
      },
      select: { id: true },
    });

    if (!category) {
      throw new NotFoundException(
        `Category with id "${categoryId}" not found for tenant`,
      );
    }
  }

  private async ensureTaxClassBelongsToTenant(
    tenantId: string,
    taxClassId?: string,
  ): Promise<void> {
    if (!taxClassId) {
      return;
    }

    const taxClass = await this.prisma.taxClass.findFirst({
      where: {
        id: taxClassId,
        tenantId,
      },
      select: { id: true },
    });

    if (!taxClass) {
      throw new NotFoundException(
        `TaxClass with id "${taxClassId}" not found for tenant`,
      );
    }
  }
}
