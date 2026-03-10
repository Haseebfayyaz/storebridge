import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'database';
import { CreateTaxClassDto } from './dto/create-tax-class.dto';
import { UpdateTaxClassDto } from './dto/update-tax-class.dto';

@Injectable()
export class TaxClassService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateTaxClassDto, tenantId: string | null) {
    const scopedTenantId = this.requireTenant(tenantId);

    return this.prisma.taxClass.create({
      data: {
        tenantId: scopedTenantId,
        name: dto.name,
        rate: dto.rate,
      },
    });
  }

  findAll(tenantId: string | null) {
    const scopedTenantId = this.requireTenant(tenantId);

    return this.prisma.taxClass.findMany({
      where: { tenantId: scopedTenantId },
      orderBy: { name: 'asc' },
    });
  }

  async update(id: string, dto: UpdateTaxClassDto, tenantId: string | null) {
    const scopedTenantId = this.requireTenant(tenantId);
    await this.findOneOrThrow(id, scopedTenantId);

    return this.prisma.taxClass.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.rate !== undefined ? { rate: dto.rate } : {}),
      },
    });
  }

  async remove(id: string, tenantId: string | null) {
    const scopedTenantId = this.requireTenant(tenantId);
    await this.findOneOrThrow(id, scopedTenantId);

    const linkedProducts = await this.prisma.product.count({
      where: { taxClassId: id, tenantId: scopedTenantId, isDeleted: false },
    });

    if (linkedProducts > 0) {
      throw new ConflictException(
        'Cannot delete tax class linked to active products',
      );
    }

    return this.prisma.taxClass.delete({ where: { id } });
  }

  private requireTenant(tenantId: string | null): string {
    if (!tenantId) {
      throw new ConflictException('Tenant context is required');
    }
    return tenantId;
  }

  private async findOneOrThrow(id: string, tenantId: string) {
    const taxClass = await this.prisma.taxClass.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });

    if (!taxClass) {
      throw new NotFoundException(`Tax class with id "${id}" not found`);
    }
  }
}
