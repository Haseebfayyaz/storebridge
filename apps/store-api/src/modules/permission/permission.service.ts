import { Injectable } from '@nestjs/common';
import { PrismaService } from 'database';
import { SAAS_DEFAULT_PERMISSIONS } from './permission.constants';

@Injectable()
export class PermissionService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.permission.findMany({
      orderBy: [{ module: 'asc' }, { name: 'asc' }],
    });
  }

  async findGrouped() {
    const permissions = await this.findAll();

    const groups: Record<string, typeof permissions> = {};
    for (const permission of permissions) {
      groups[permission.module] = groups[permission.module] ?? [];
      groups[permission.module].push(permission);
    }

    return groups;
  }

  async seedDefaults() {
    for (const permission of SAAS_DEFAULT_PERMISSIONS) {
      await this.prisma.permission.upsert({
        where: { name: permission.name },
        update: {
          module: permission.module,
          description: permission.description,
        },
        create: {
          name: permission.name,
          module: permission.module,
          description: permission.description,
        },
      });
    }

    return this.findAll();
  }
}
