import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'database';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoryService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCategoryDto, tenantId: string | null) {
    const scopedTenantId = this.requireTenant(tenantId);

    await this.ensureUniqueSlug(scopedTenantId, dto.slug);
    await this.ensureParentBelongsToTenant(scopedTenantId, dto.parentId);

    return this.prisma.category.create({
      data: {
        tenantId: scopedTenantId,
        name: dto.name,
        slug: dto.slug,
        parentId: dto.parentId,
      },
    });
  }

  findAll(tenantId: string | null) {
    const scopedTenantId = this.requireTenant(tenantId);

    return this.prisma.category.findMany({
      where: { tenantId: scopedTenantId },
      include: {
        parent: true,
        children: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  async update(id: string, dto: UpdateCategoryDto, tenantId: string | null) {
    const scopedTenantId = this.requireTenant(tenantId);
    const current = await this.findOneOrThrow(id, scopedTenantId);

    if (dto.slug && dto.slug !== current.slug) {
      await this.ensureUniqueSlug(scopedTenantId, dto.slug, id);
    }

    if (dto.parentId !== undefined) {
      if (dto.parentId === id) {
        throw new ConflictException('Category cannot be parent of itself');
      }
      await this.ensureParentBelongsToTenant(scopedTenantId, dto.parentId || undefined);
    }

    return this.prisma.category.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.slug !== undefined ? { slug: dto.slug } : {}),
        ...(dto.parentId !== undefined ? { parentId: dto.parentId || null } : {}),
      },
    });
  }

  async remove(id: string, tenantId: string | null) {
    const scopedTenantId = this.requireTenant(tenantId);
    await this.findOneOrThrow(id, scopedTenantId);

    const hasChildren = await this.prisma.category.count({ where: { parentId: id } });
    if (hasChildren > 0) {
      throw new ConflictException(
        'Cannot delete a category that has child categories',
      );
    }

    return this.prisma.category.delete({ where: { id } });
  }

  private requireTenant(tenantId: string | null): string {
    if (!tenantId) {
      throw new ConflictException('Tenant context is required');
    }
    return tenantId;
  }

  private async findOneOrThrow(id: string, tenantId: string) {
    const category = await this.prisma.category.findFirst({
      where: { id, tenantId },
    });

    if (!category) {
      throw new NotFoundException(`Category with id "${id}" not found`);
    }

    return category;
  }

  private async ensureUniqueSlug(
    tenantId: string,
    slug: string,
    excludeId?: string,
  ): Promise<void> {
    const existing = await this.prisma.category.findFirst({
      where: {
        tenantId,
        slug,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException(
        `Category slug "${slug}" already exists for this tenant`,
      );
    }
  }

  private async ensureParentBelongsToTenant(
    tenantId: string,
    parentId?: string,
  ): Promise<void> {
    if (!parentId) {
      return;
    }

    const parent = await this.prisma.category.findFirst({
      where: { id: parentId, tenantId },
      select: { id: true },
    });

    if (!parent) {
      throw new NotFoundException(
        `Parent category with id "${parentId}" not found in tenant`,
      );
    }
  }
}
