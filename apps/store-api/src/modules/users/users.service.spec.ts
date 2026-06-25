import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from 'database';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      user: {
        findMany: jest.fn(),
        count: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      role: {
        findFirst: jest.fn(),
      },
      store: {
        findFirst: jest.fn(),
      },
      tenant: {
        findFirst: jest.fn(),
      },
      userRoleAssignment: {
        deleteMany: jest.fn(),
        create: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    prisma.$transaction.mockImplementation((cb: (tx: unknown) => unknown) => cb(prisma));

    const moduleRef = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = moduleRef.get(UsersService);
  });

  it('lists store users with pagination and latest role assignment', async () => {
    prisma.user.findMany.mockResolvedValue([
      {
        id: 'u-1',
        name: 'John Manager',
        email: 'john@example.com',
        mobile: '111',
        image: null,
        isBlocked: false,
        isVerified: true,
        isDeleted: false,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        roles: [
          {
            tenantId: 'tenant-1',
            storeId: 'store-1',
            createdAt: new Date('2026-01-02T00:00:00.000Z'),
            role: {
              id: 'role-1',
              name: 'Store Manager',
              isAdmin: false,
              isSystem: true,
            },
            store: {
              id: 'store-1',
              name: 'Main Store',
              city: 'Lahore',
              country: 'PK',
            },
          },
        ],
      },
    ]);
    prisma.user.count.mockResolvedValue(1);

    const result = await service.listUsers(
      { page: 2, limit: 10, search: 'John' },
      'tenant-1',
    );

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 10,
        take: 10,
      }),
    );
    expect(result.pagination).toEqual({
      page: 2,
      limit: 10,
      total: 1,
      totalPages: 1,
    });
    expect(result.data[0]).toMatchObject({
      id: 'u-1',
      name: 'John Manager',
      role: {
        id: 'role-1',
        name: 'Store Manager',
      },
      assignment: {
        tenantId: 'tenant-1',
        storeId: 'store-1',
      },
    });
  });

  it('lists store customers with latest order and address', async () => {
    prisma.user.findMany.mockResolvedValue([
      {
        id: 'c-1',
        name: 'Customer One',
        email: 'customer@example.com',
        mobile: '222',
        image: null,
        createdAt: new Date('2026-01-03T00:00:00.000Z'),
        orders: [
          {
            id: 'order-1',
            total: 600,
            status: 'PENDING',
            createdAt: new Date('2026-01-05T00:00:00.000Z'),
            store: { id: 'store-1', name: 'Main Store' },
          },
        ],
        addresses: [
          {
            id: 'addr-1',
            name: 'Customer One',
            email: 'customer@example.com',
            phone: '222',
            street: 'Street 1',
            city: 'Lahore',
            state: 'Punjab',
            zip: '54000',
            country: 'PK',
          },
        ],
      },
    ]);
    prisma.user.count.mockResolvedValue(1);

    const result = await service.listCustomers({ page: 1, limit: 5 }, 'tenant-1');

    expect(result.data[0]).toMatchObject({
      id: 'c-1',
      latestOrder: {
        id: 'order-1',
        total: 600,
        status: 'PENDING',
        store: { id: 'store-1', name: 'Main Store' },
      },
      latestAddress: {
        id: 'addr-1',
        city: 'Lahore',
      },
    });
  });

  it('updates user role within tenant scope', async () => {
    prisma.user.findFirst.mockResolvedValue({
      id: 'u-1',
      isSuperAdmin: false,
    });
    prisma.role.findFirst.mockResolvedValue({
      id: 'role-2',
      tenantId: 'tenant-1',
      storeId: 'store-1',
      name: 'Store Manager',
      isAdmin: false,
      isSystem: true,
    });
    prisma.store.findFirst.mockResolvedValue({ id: 'store-1' });
    prisma.userRoleAssignment.create.mockResolvedValue({});

    const result = await service.updateUserRole(
      'u-1',
      { roleId: 'role-2' },
      'tenant-1',
      'actor-1',
    );

    expect(prisma.userRoleAssignment.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u-1', tenantId: 'tenant-1' },
    });
    expect(result).toMatchObject({
      userId: 'u-1',
      roleId: 'role-2',
      storeId: 'store-1',
    });
  });

  it('soft deletes a tenant user', async () => {
    prisma.user.findFirst.mockResolvedValue({
      id: 'u-1',
      isSuperAdmin: false,
    });
    prisma.tenant.findFirst.mockResolvedValue(null);
    prisma.user.update.mockResolvedValue({ id: 'u-1', isDeleted: true });

    const result = await service.deleteUser('u-1', 'tenant-1', 'actor-2');

    expect(prisma.userRoleAssignment.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u-1', tenantId: 'tenant-1' },
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u-1' },
      data: expect.objectContaining({
        isDeleted: true,
        isBlocked: true,
      }),
    });
    expect(result).toEqual({ id: 'u-1', isDeleted: true });
  });

  it('rejects tenant-less access', async () => {
    await expect(service.listUsers({}, null)).rejects.toBeInstanceOf(ConflictException);
  });
});
