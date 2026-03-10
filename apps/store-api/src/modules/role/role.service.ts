import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'database';
import { PermissionService } from '../permission/permission.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { ManageRolePermissionsDto } from './dto/manage-role-permissions.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

@Injectable()
export class RoleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionService: PermissionService,
  ) {}

  async create(dto: CreateRoleDto, actorTenantId: string | null) {
    const tenantId = this.resolveTenantForRole(actorTenantId, dto.tenantId);

    if (dto.storeId) {
      await this.ensureStoreBelongsToTenant(dto.storeId, tenantId);
    }

    return this.prisma.role.create({
      data: {
        name: dto.name,
        description: dto.description,
        tenantId,
        storeId: dto.storeId,
        isAdmin: dto.isAdmin ?? false,
      },
    });
  }

  async findAll(actorTenantId: string | null) {
    const roles = await this.prisma.role.findMany({
      where: actorTenantId
        ? {
            OR: [{ tenantId: actorTenantId }, { tenantId: null }],
          }
        : {},
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }],
    });

    const allPermissions = await this.permissionService.findAll();

    return roles.map((role) => ({
      ...role,
      effectivePermissions: role.isAdmin
        ? allPermissions
        : role.permissions.map((rp) => rp.permission),
    }));
  }

  async update(id: string, dto: UpdateRoleDto, actorTenantId: string | null) {
    const role = await this.findRoleForActor(id, actorTenantId);

    if (role.isSystem) {
      throw new ConflictException('System roles cannot be updated');
    }

    if (dto.storeId) {
      await this.ensureStoreBelongsToTenant(dto.storeId, role.tenantId);
    }

    const updated = await this.prisma.role.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.storeId !== undefined ? { storeId: dto.storeId || null } : {}),
        ...(dto.isAdmin !== undefined ? { isAdmin: dto.isAdmin } : {}),
      },
    });

    if (dto.isAdmin === true) {
      await this.prisma.rolePermission.deleteMany({ where: { roleId: id } });
    }

    return updated;
  }

  async remove(id: string, actorTenantId: string | null) {
    const role = await this.findRoleForActor(id, actorTenantId);

    if (role.isSystem) {
      throw new ConflictException('System roles cannot be deleted');
    }

    return this.prisma.role.delete({ where: { id } });
  }

  async managePermissions(
    roleId: string,
    dto: ManageRolePermissionsDto,
    actorTenantId: string | null,
  ) {
    const role = await this.findRoleForActor(roleId, actorTenantId);

    if (role.isAdmin) {
      await this.prisma.rolePermission.deleteMany({ where: { roleId } });
      const permissions = await this.permissionService.findAll();
      return {
        roleId,
        isAdmin: true,
        effectivePermissions: permissions,
      };
    }

    if (dto.permissionIds) {
      await this.ensurePermissionsExist(dto.permissionIds);

      await this.prisma.$transaction(async (tx) => {
        await tx.rolePermission.deleteMany({ where: { roleId } });

        if (dto.permissionIds && dto.permissionIds.length > 0) {
          await tx.rolePermission.createMany({
            data: dto.permissionIds.map((permissionId) => ({
              roleId,
              permissionId,
            })),
            skipDuplicates: true,
          });
        }
      });
    } else {
      if (!dto.permissionId || dto.enabled === undefined) {
        throw new ConflictException(
          'Provide permissionIds[] or permissionId + enabled',
        );
      }

      await this.ensurePermissionsExist([dto.permissionId]);

      if (dto.enabled) {
        await this.prisma.rolePermission.upsert({
          where: {
            roleId_permissionId: {
              roleId,
              permissionId: dto.permissionId,
            },
          },
          create: { roleId, permissionId: dto.permissionId },
          update: {},
        });
      } else {
        await this.prisma.rolePermission.deleteMany({
          where: {
            roleId,
            permissionId: dto.permissionId,
          },
        });
      }
    }

    const updatedRole = await this.prisma.role.findUnique({
      where: { id: roleId },
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
      },
    });

    return {
      roleId,
      isAdmin: updatedRole?.isAdmin ?? false,
      effectivePermissions:
        updatedRole?.permissions.map((rp) => rp.permission) ?? [],
    };
  }

  async getCurrentUserRolePermissions(
    userId: string,
    actorTenantId: string | null,
  ) {
    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { createdById: true },
    });

    const assignments = await this.prisma.userRoleAssignment.findMany({
      where: actorTenantId
        ? {
            userId,
            OR: [{ tenantId: actorTenantId }, { tenantId: null }],
          }
        : { userId },
      include: {
        role: {
          include: {
            permissions: {
              include: {
                permission: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const allPermissions = await this.permissionService.findAll();

    if (!currentUser?.createdById && assignments.length === 0) {
      return {
        userId,
        tenantId: actorTenantId,
        roles: [],
        effectivePermissions: allPermissions,
        isAdmin: true,
      };
    }

    const roles = assignments.map((assignment) => {
      const role = assignment.role;
      return {
        id: role.id,
        name: role.name,
        description: role.description,
        tenantId: role.tenantId,
        storeId: role.storeId,
        isSystem: role.isSystem,
        isAdmin: role.isAdmin,
        effectivePermissions: role.isAdmin
          ? allPermissions
          : role.permissions.map((rp) => rp.permission),
      };
    });

    const permissionMap = new Map<string, (typeof allPermissions)[number]>();
    for (const role of roles) {
      for (const permission of role.effectivePermissions) {
        permissionMap.set(permission.id, permission);
      }
    }

    return {
      userId,
      tenantId: actorTenantId,
      roles,
      effectivePermissions: [...permissionMap.values()],
    };
  }

  private resolveTenantForRole(
    actorTenantId: string | null,
    requestedTenantId?: string,
  ): string | null {
    if (actorTenantId) {
      if (requestedTenantId && requestedTenantId !== actorTenantId) {
        throw new ConflictException(
          'Cannot create a role for a different tenant',
        );
      }

      return actorTenantId;
    }

    return requestedTenantId ?? null;
  }

  private async findRoleForActor(id: string, actorTenantId: string | null) {
    const role = await this.prisma.role.findFirst({
      where: actorTenantId
        ? {
            id,
            OR: [{ tenantId: actorTenantId }, { tenantId: null }],
          }
        : { id },
    });

    if (!role) {
      throw new NotFoundException(`Role with id "${id}" not found`);
    }

    return role;
  }

  private async ensureStoreBelongsToTenant(
    storeId: string,
    tenantId: string | null,
  ): Promise<void> {
    if (!tenantId) {
      throw new ConflictException('Store-specific roles require tenantId');
    }

    const store = await this.prisma.store.findFirst({
      where: {
        id: storeId,
        tenantId,
        isDeleted: false,
      },
      select: { id: true },
    });

    if (!store) {
      throw new NotFoundException(
        `Store with id "${storeId}" not found in role tenant`,
      );
    }
  }

  private async ensurePermissionsExist(permissionIds: string[]): Promise<void> {
    const permissions = await this.prisma.permission.findMany({
      where: { id: { in: permissionIds } },
      select: { id: true },
    });

    if (permissions.length !== permissionIds.length) {
      throw new NotFoundException('One or more permissions were not found');
    }
  }
}
