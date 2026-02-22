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
        ownerId: dto.ownerId,
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
        ...(dto.ownerId !== undefined ? { ownerId: dto.ownerId } : {}),
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.store.delete({ where: { id } });
  }
}
