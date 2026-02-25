import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'database';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';

@Injectable()
export class StoreService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateStoreDto) {
    return this.prisma.store.create({
      data: {
        name: dto.name,
        tenantId: dto.tenantId,
        city: dto.city,
        country: dto.country,
        timezone: dto.timezone,
      },
    });
  }

  findAll() {
    return this.prisma.store.findMany({
      orderBy: { id: 'desc' },
    });
  }

  async findOne(id: string) {
    const store = await this.prisma.store.findUnique({ where: { id } });
    if (!store) {
      throw new NotFoundException(`Store with id \"${id}\" not found`);
    }
    return store;
  }

  async update(id: string, dto: UpdateStoreDto) {
    await this.findOne(id);

    return this.prisma.store.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.tenantId !== undefined ? { tenantId: dto.tenantId } : {}),
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.store.delete({ where: { id } });
  }
}
