import { Injectable } from '@nestjs/common';
import { PrismaService } from 'database';

@Injectable()
export class CategoryService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.category.findMany();
  }
}