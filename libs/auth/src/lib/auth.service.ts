import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma, User } from '@prisma/client';
import { PrismaService } from 'database';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { LoginDto } from './dto/login.dto';
import { CustomerSignupDto } from './dto/customer-signup.dto';
import { VendorSignupDto } from './dto/vendor-signup.dto';
import {
  DEFAULT_PERMISSION_SEED,
  SYSTEM_ROLE_STORE_MANAGER,
  SYSTEM_ROLE_VENDOR_OWNER,
} from './auth.constants';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async signupCustomer(
    dto: CustomerSignupDto,
  ): Promise<{ access_token: string }> {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new ConflictException('Email already exists');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.user.create({
      data: {
        id: randomUUID(),
        name: dto.name,
        email: dto.email,
        mobile: dto.phone,
        password: hashedPassword,
      },
    });

    return this.buildAccessToken(user, null);
  }

  async signupVendor(dto: VendorSignupDto): Promise<{ access_token: string }> {
    const result = await this.prisma.$transaction(async (tx) => {
      let user = await this.findOrCreateVendorOwner(tx, dto);

      const existingTenant = await tx.tenant.findUnique({
        where: { ownerId: user.id },
      });
      if (existingTenant) {
        throw new ConflictException('This account already has a tenant');
      }

      const tenant = await tx.tenant.create({
        data: {
          name: dto.company.name,
          country: dto.company.country,
          currency: dto.company.currency,
          ownerId: user.id,
        },
      });

      const store = await tx.store.create({
        data: {
          tenantId: tenant.id,
          name: dto.store.name,
          city: dto.store.city,
          country: dto.store.country,
          timezone: dto.store.timezone,
        },
      });

      const { vendorOwnerRole, storeManagerRole } =
        await this.ensureSystemRoles(tx, tenant.id);
      await this.ensureDefaultPermissions(tx);
      await this.assignAllPermissionsToRole(tx, vendorOwnerRole.id);

      await tx.userRoleAssignment.createMany({
        data: [
          {
            userId: user.id,
            roleId: vendorOwnerRole.id,
            tenantId: tenant.id,
          },
          {
            userId: user.id,
            roleId: storeManagerRole.id,
            tenantId: tenant.id,
            storeId: store.id,
          },
        ],
      });
      user = await tx.user.update({
        where: { id: user.id },
        data: { storeId: store.id },
      });

      return { user, tenantId: tenant.id };
    });

    return this.buildAccessToken(result.user, result.tenantId);
  }

  async login(dto: LoginDto): Promise<{ access_token: string }> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: {
        roles: {
          include: { tenant: true, role: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!user || !user.password) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isMatch = await bcrypt.compare(dto.password, user.password);
    if (!isMatch) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const tenantId = user.roles[0]?.tenantId ?? null;
    console.log(user, user.roles[0], tenantId);
    return this.buildAccessToken(user, tenantId);
  }

  async profile(
    userId: string,
  ): Promise<{ id: string; email: string; name: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
    };
  }

  private async findOrCreateVendorOwner(
    tx: Prisma.TransactionClient,
    dto: VendorSignupDto,
  ): Promise<User> {
    const existingUser = await tx.user.findUnique({
      where: { email: dto.admin.email },
    });

    if (!existingUser) {
      const hashedPassword = await bcrypt.hash(dto.admin.password, 12);
      return tx.user.create({
        data: {
          id: randomUUID(),
          name: dto.admin.name,
          email: dto.admin.email,
          password: hashedPassword,
        },
      });
    }

    if (!existingUser.password) {
      const hashedPassword = await bcrypt.hash(dto.admin.password, 12);
      return tx.user.update({
        where: { id: existingUser.id },
        data: { name: dto.admin.name, password: hashedPassword },
      });
    }

    const passwordMatches = await bcrypt.compare(
      dto.admin.password,
      existingUser.password,
    );

    if (!passwordMatches) {
      throw new BadRequestException(
        'Email already exists with different credentials',
      );
    }

    return tx.user.update({
      where: { id: existingUser.id },
      data: { name: dto.admin.name },
    });
  }

  private async ensureSystemRoles(
    tx: Prisma.TransactionClient,
    tenantId: string,
  ) {
    const vendorOwnerRole = await this.findOrCreateRole(tx, {
      tenantId,
      name: SYSTEM_ROLE_VENDOR_OWNER,
      description: 'Full access over tenant resources',
      isSystem: true,
    });

    const storeManagerRole = await this.findOrCreateRole(tx, {
      tenantId,
      name: SYSTEM_ROLE_STORE_MANAGER,
      description: 'Store-level operational access',
      isSystem: true,
    });

    return { vendorOwnerRole, storeManagerRole };
  }

  private async findOrCreateRole(
    tx: Prisma.TransactionClient,
    data: {
      tenantId: string;
      name: string;
      description: string;
      isSystem: boolean;
    },
  ) {
    const role = await tx.role.findFirst({
      where: {
        tenantId: data.tenantId,
        name: data.name,
        storeId: null,
      },
    });

    if (role) {
      return role;
    }

    return tx.role.create({
      data: {
        name: data.name,
        description: data.description,
        isSystem: data.isSystem,
        tenantId: data.tenantId,
      },
    });
  }

  private async ensureDefaultPermissions(
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    for (const permission of DEFAULT_PERMISSION_SEED) {
      await tx.permission.upsert({
        where: { name: permission.name },
        update: {},
        create: {
          name: permission.name,
          module: permission.module,
          description: permission.description,
        },
      });
    }
  }

  private async assignAllPermissionsToRole(
    tx: Prisma.TransactionClient,
    roleId: string,
  ): Promise<void> {
    const allPermissions = await tx.permission.findMany({
      select: { id: true },
    });

    if (allPermissions.length === 0) {
      return;
    }

    await tx.rolePermission.createMany({
      data: allPermissions.map((permission) => ({
        roleId,
        permissionId: permission.id,
      })),
      skipDuplicates: true,
    });
  }

  private async buildAccessToken(
    user: User,
    tenantId: string | null,
  ): Promise<{ access_token: string }> {
    const payload = {
      sub: user.id,
      email: user.email,
      tenantId,
    };

    return {
      access_token: await this.jwtService.signAsync(payload),
    };
  }
}
