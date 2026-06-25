import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'database';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async listUsers(query: ListUsersQueryDto, tenantId: string | null) {
    const scopedTenantId = this.requireTenant(tenantId);
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    const where = this.buildTenantUserWhere(scopedTenantId, query.search);

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        include: {
          roles: {
            where: { tenantId: scopedTenantId },
            include: {
              role: true,
              store: { select: { id: true, name: true, city: true, country: true } },
            },
            orderBy: { createdAt: 'desc' },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: users.map((user) => {
        const assignment = user.roles[0];
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          mobile: user.mobile,
          image: user.image,
          isBlocked: user.isBlocked,
          isVerified: user.isVerified,
          isDeleted: user.isDeleted,
          createdAt: user.createdAt,
          role: assignment
            ? {
                id: assignment.role.id,
                name: assignment.role.name,
                isAdmin: assignment.role.isAdmin,
                isSystem: assignment.role.isSystem,
              }
            : null,
          assignment: assignment
            ? {
                tenantId: assignment.tenantId,
                storeId: assignment.storeId,
                assignedAt: assignment.createdAt,
                store: assignment.store,
              }
            : null,
        };
      }),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      filters: {
        search: query.search ?? null,
      },
    };
  }

  async listCustomers(query: ListUsersQueryDto, tenantId: string | null) {
    const scopedTenantId = this.requireTenant(tenantId);
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    const where = this.buildTenantCustomerWhere(scopedTenantId, query.search);

    const [customers, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        include: {
          orders: {
            where: { store: { tenantId: scopedTenantId } },
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              id: true,
              total: true,
              status: true,
              createdAt: true,
              store: { select: { id: true, name: true } },
            },
          },
          addresses: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              street: true,
              city: true,
              state: true,
              zip: true,
              country: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: customers.map((customer) => {
        const latestOrder = customer.orders[0] ?? null;
        const latestAddress = customer.addresses[0] ?? null;

        return {
          id: customer.id,
          name: customer.name,
          email: customer.email,
          mobile: customer.mobile,
          image: customer.image,
          createdAt: customer.createdAt,
          latestOrder: latestOrder
            ? {
                id: latestOrder.id,
                total: latestOrder.total,
                status: latestOrder.status,
                createdAt: latestOrder.createdAt,
                store: latestOrder.store,
              }
            : null,
          latestAddress,
        };
      }),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      filters: {
        search: query.search ?? null,
      },
    };
  }

  async updateUserRole(
    userId: string,
    dto: UpdateUserRoleDto,
    tenantId: string | null,
    actorId?: string,
  ) {
    const scopedTenantId = this.requireTenant(tenantId);
    if (actorId && actorId === userId) {
      throw new ConflictException('You cannot update your own role');
    }

    const targetUser = await this.findTenantUser(userId, scopedTenantId);
    if (!targetUser) {
      throw new NotFoundException(`User with id "${userId}" not found`);
    }

    if (targetUser.isSuperAdmin) {
      throw new ConflictException('Super admin role cannot be changed');
    }

    const role = await this.prisma.role.findFirst({
      where: {
        id: dto.roleId,
        OR: [{ tenantId: scopedTenantId }, { tenantId: null }],
      },
      select: {
        id: true,
        tenantId: true,
        storeId: true,
        name: true,
        isAdmin: true,
        isSystem: true,
      },
    });

    if (!role) {
      throw new NotFoundException(`Role with id "${dto.roleId}" not found`);
    }

    const assignedStoreId = dto.storeId ?? role.storeId ?? null;
    if (assignedStoreId) {
      await this.ensureStoreBelongsToTenant(assignedStoreId, scopedTenantId);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.userRoleAssignment.deleteMany({
        where: {
          userId,
          tenantId: scopedTenantId,
        },
      });

      await tx.userRoleAssignment.create({
        data: {
          userId,
          roleId: role.id,
          tenantId: scopedTenantId,
          storeId: assignedStoreId,
        },
      });
    });

    return {
      userId,
      roleId: role.id,
      roleName: role.name,
      tenantId: scopedTenantId,
      storeId: assignedStoreId,
    };
  }

  async deleteUser(
    userId: string,
    tenantId: string | null,
    actorId?: string,
  ) {
    const scopedTenantId = this.requireTenant(tenantId);
    if (actorId && actorId === userId) {
      throw new ConflictException('You cannot delete your own account');
    }

    const targetUser = await this.findTenantUser(userId, scopedTenantId);
    if (!targetUser) {
      throw new NotFoundException(`User with id "${userId}" not found`);
    }

    if (targetUser.isSuperAdmin) {
      throw new ConflictException('Super admin account cannot be deleted');
    }

    const tenantOwner = await this.prisma.tenant.findFirst({
      where: { id: scopedTenantId, ownerId: userId },
      select: { id: true },
    });

    if (tenantOwner) {
      throw new ConflictException('Tenant owner cannot be deleted');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.userRoleAssignment.deleteMany({
        where: {
          userId,
          tenantId: scopedTenantId,
        },
      });

      return tx.user.update({
        where: { id: userId },
        data: {
          isDeleted: true,
          isBlocked: true,
          deletedAt: new Date(),
        },
      });
    });
  }

  private requireTenant(tenantId: string | null): string {
    if (!tenantId) {
      throw new ConflictException('Tenant context is required');
    }

    return tenantId;
  }

  private buildTenantUserWhere(tenantId: string, search?: string): Prisma.UserWhereInput {
    const trimmedSearch = search?.trim();
    return {
      isDeleted: false,
      roles: {
        some: {
          tenantId,
        },
      },
      ...(trimmedSearch
        ? {
            OR: [
              { name: { contains: trimmedSearch, mode: 'insensitive' } },
              { email: { contains: trimmedSearch, mode: 'insensitive' } },
              { mobile: { contains: trimmedSearch, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
  }

  private buildTenantCustomerWhere(
    tenantId: string,
    search?: string,
  ): Prisma.UserWhereInput {
    const trimmedSearch = search?.trim();
    return {
      isDeleted: false,
      orders: {
        some: {
          store: {
            tenantId,
          },
        },
      },
      ...(trimmedSearch
        ? {
            OR: [
              { name: { contains: trimmedSearch, mode: 'insensitive' } },
              { email: { contains: trimmedSearch, mode: 'insensitive' } },
              { mobile: { contains: trimmedSearch, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
  }

  private async findTenantUser(userId: string, tenantId: string) {
    return this.prisma.user.findFirst({
      where: {
        id: userId,
        isDeleted: false,
        roles: {
          some: {
            tenantId,
          },
        },
      },
      select: {
        id: true,
        isSuperAdmin: true,
      },
    });
  }

  private async ensureStoreBelongsToTenant(storeId: string, tenantId: string) {
    const store = await this.prisma.store.findFirst({
      where: { id: storeId, tenantId, isDeleted: false },
      select: { id: true },
    });

    if (!store) {
      throw new ConflictException(
        `Store with id "${storeId}" does not belong to the current tenant`,
      );
    }
  }
}
