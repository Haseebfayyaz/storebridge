import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PaymentMethod, Prisma } from '@prisma/client';
import { PrismaService } from 'database';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';
import { UpsertAddressDto } from './dto/upsert-address.dto';

@Injectable()
export class CartService {
  constructor(private readonly prisma: PrismaService) {}

  async getCart(userId: string) {
    const cart = await this.prisma.cart.findUnique({
      where: { userId },
      include: {
        store: { select: { id: true, name: true, city: true, country: true } },
        items: {
          include: {
            inventory: {
              include: {
                variant: {
                  include: {
                    product: { select: { id: true, name: true, description: true } },
                  },
                },
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!cart) {
      return { store: null, items: [], totals: { subtotal: 0, itemCount: 0 } };
    }

    const items = cart.items.map((item) => {
      const price = item.inventory.storePrice ?? item.inventory.variant.price;
      return {
        inventoryId: item.inventoryId,
        variantId: item.inventory.variantId,
        productName: item.inventory.variant.product.name,
        quantity: item.quantity,
        unitPrice: price,
        lineTotal: price * item.quantity,
      };
    });

    return {
      id: cart.id,
      store: cart.store,
      items,
      totals: {
        subtotal: items.reduce((sum, item) => sum + item.lineTotal, 0),
        itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
      },
    };
  }

  async addItem(userId: string, dto: AddCartItemDto) {
    return this.prisma.$transaction(async (tx) => {
      const inventory = await tx.inventory.findFirst({
        where: { id: dto.inventoryId, isDeleted: false },
        select: { id: true, storeId: true },
      });
      if (!inventory) {
        throw new NotFoundException('Inventory item not found');
      }

      let cart = await tx.cart.findUnique({ where: { userId } });
      if (!cart) {
        cart = await tx.cart.create({
          data: { userId, storeId: inventory.storeId },
        });
      }

      if (cart.storeId !== inventory.storeId) {
        throw new BadRequestException(
          'Cart can only contain items from one store at a time',
        );
      }

      const existing = await tx.cartItem.findUnique({
        where: { cartId_inventoryId: { cartId: cart.id, inventoryId: dto.inventoryId } },
      });

      const reserveDelta = dto.quantity;
      const inventoryUpdate = await tx.$executeRaw(Prisma.sql`
        UPDATE "Inventory"
        SET "reservedQty" = "reservedQty" + ${reserveDelta}
        WHERE "id" = ${dto.inventoryId}
          AND "isDeleted" = false
          AND ("stockQty" - "reservedQty") >= ${reserveDelta}
      `);

      if (inventoryUpdate === 0) {
        throw new BadRequestException('Requested quantity is out of stock');
      }

      if (existing) {
        await tx.cartItem.update({
          where: { id: existing.id },
          data: { quantity: existing.quantity + dto.quantity },
        });
      } else {
        await tx.cartItem.create({
          data: { cartId: cart.id, inventoryId: dto.inventoryId, quantity: dto.quantity },
        });
      }

      return this.getCartSnapshot(tx, userId);
    });
  }

  async updateItem(userId: string, dto: UpdateCartItemDto) {
    return this.prisma.$transaction(async (tx) => {
      const cart = await tx.cart.findUnique({ where: { userId } });
      if (!cart) {
        throw new NotFoundException('Cart not found');
      }

      const item = await tx.cartItem.findUnique({
        where: { cartId_inventoryId: { cartId: cart.id, inventoryId: dto.inventoryId } },
      });
      if (!item) {
        throw new NotFoundException('Cart item not found');
      }

      const delta = dto.quantity - item.quantity;
      if (delta > 0) {
        const inventoryUpdate = await tx.$executeRaw(Prisma.sql`
          UPDATE "Inventory"
          SET "reservedQty" = "reservedQty" + ${delta}
          WHERE "id" = ${dto.inventoryId}
            AND "isDeleted" = false
            AND ("stockQty" - "reservedQty") >= ${delta}
        `);
        if (inventoryUpdate === 0) {
          throw new BadRequestException('Requested quantity is out of stock');
        }
      } else if (delta < 0) {
        const releaseQty = Math.abs(delta);
        const releaseUpdate = await tx.inventory.updateMany({
          where: { id: dto.inventoryId, reservedQty: { gte: releaseQty } },
          data: { reservedQty: { decrement: releaseQty } },
        });
        if (releaseUpdate.count === 0) {
          throw new BadRequestException('Failed to update reserved quantity');
        }
      }

      await tx.cartItem.update({
        where: { id: item.id },
        data: { quantity: dto.quantity },
      });

      return this.getCartSnapshot(tx, userId);
    });
  }

  async removeItem(userId: string, inventoryId: string) {
    return this.prisma.$transaction(async (tx) => {
      const cart = await tx.cart.findUnique({ where: { userId } });
      if (!cart) {
        throw new NotFoundException('Cart not found');
      }

      const item = await tx.cartItem.findUnique({
        where: { cartId_inventoryId: { cartId: cart.id, inventoryId } },
      });
      if (!item) {
        throw new NotFoundException('Cart item not found');
      }

      const releaseUpdate = await tx.inventory.updateMany({
        where: { id: inventoryId, reservedQty: { gte: item.quantity } },
        data: { reservedQty: { decrement: item.quantity } },
      });
      if (releaseUpdate.count === 0) {
        throw new BadRequestException('Failed to release reserved stock');
      }

      await tx.cartItem.delete({ where: { id: item.id } });

      const remainingCount = await tx.cartItem.count({ where: { cartId: cart.id } });
      if (remainingCount === 0) {
        await tx.cart.delete({ where: { id: cart.id } });
      }

      return this.getCartSnapshot(tx, userId);
    });
  }

  async upsertAddress(userId: string, dto: UpsertAddressDto) {
    const existing = await this.prisma.address.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    if (existing) {
      return this.prisma.address.update({
        where: { id: existing.id },
        data: dto,
      });
    }

    return this.prisma.address.create({
      data: { userId, ...dto },
    });
  }

  async createOrder(userId: string, dto: CreateOrderDto) {
    return this.prisma.$transaction(async (tx) => {
      const cart = await tx.cart.findUnique({
        where: { userId },
        include: { items: true },
      });
      if (!cart || cart.items.length === 0) {
        throw new BadRequestException('Cart is empty');
      }

      const inventoryRows = await tx.inventory.findMany({
        where: { id: { in: cart.items.map((item) => item.inventoryId) } },
        include: {
          variant: {
            include: {
              product: { select: { id: true, name: true } },
            },
          },
        },
      });

      if (inventoryRows.length !== cart.items.length) {
        throw new BadRequestException('Some cart items are invalid');
      }

      const inventoryById = new Map(inventoryRows.map((row) => [row.id, row]));
      let total = 0;
      const orderItemsPayload: { variantId: string; quantity: number; price: number }[] = [];

      for (const item of cart.items) {
        const inventory = inventoryById.get(item.inventoryId);
        if (!inventory) {
          throw new BadRequestException('Cart item no longer available');
        }
        if (inventory.storeId !== cart.storeId) {
          throw new BadRequestException('Cart contains invalid store items');
        }
        if (inventory.reservedQty < item.quantity || inventory.stockQty < item.quantity) {
          throw new BadRequestException('Insufficient stock for checkout');
        }
        const price = inventory.storePrice ?? inventory.variant.price;
        total += price * item.quantity;
        orderItemsPayload.push({
          variantId: inventory.variantId,
          quantity: item.quantity,
          price,
        });
      }

      const addressFromDb = dto.addressId
        ? await tx.address.findFirst({ where: { id: dto.addressId, userId } })
        : await tx.address.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } });

      const shipping = {
        customerName: dto.name ?? addressFromDb?.name ?? null,
        customerEmail: dto.email ?? addressFromDb?.email ?? null,
        customerPhone: dto.phone ?? addressFromDb?.phone ?? null,
        shippingStreet: dto.street ?? addressFromDb?.street ?? null,
        shippingCity: dto.city ?? addressFromDb?.city ?? null,
        shippingState: dto.state ?? addressFromDb?.state ?? null,
        shippingZip: dto.zip ?? addressFromDb?.zip ?? null,
        shippingCountry: dto.country ?? addressFromDb?.country ?? null,
      };

      if (!shipping.customerName || !shipping.customerPhone || !shipping.shippingStreet) {
        throw new BadRequestException(
          'Address and personal details are required to place order',
        );
      }

      for (const item of cart.items) {
        const stockUpdate = await tx.inventory.updateMany({
          where: {
            id: item.inventoryId,
            stockQty: { gte: item.quantity },
            reservedQty: { gte: item.quantity },
          },
          data: {
            stockQty: { decrement: item.quantity },
            reservedQty: { decrement: item.quantity },
          },
        });
        if (stockUpdate.count === 0) {
          throw new BadRequestException(
            'Stock changed during checkout, please review cart and retry',
          );
        }
      }

      const order = await tx.order.create({
        data: {
          userId,
          storeId: cart.storeId,
          total,
          status: 'PENDING',
          paymentMethod: (dto.paymentMethod ?? 'COD') as PaymentMethod,
          isPaid: false,
          ...shipping,
          items: { create: orderItemsPayload },
        },
        include: {
          items: {
            include: {
              variant: { include: { product: { select: { name: true } } } },
            },
          },
        },
      });

      await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
      await tx.cart.delete({ where: { id: cart.id } });

      return {
        id: order.id,
        status: order.status,
        paymentMethod: order.paymentMethod,
        total: order.total,
        items: order.items.map((item) => ({
          variantId: item.variantId,
          productName: item.variant.product.name,
          quantity: item.quantity,
          price: item.price,
        })),
      };
    });
  }

  async getOrders(userId: string) {
    const orders = await this.prisma.order.findMany({
      where: { userId },
      include: {
        items: {
          include: {
            variant: { include: { product: { select: { name: true } } } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return orders.map((order) => ({
      id: order.id,
      status: order.status,
      paymentMethod: order.paymentMethod,
      total: order.total,
      isPaid: order.isPaid,
      customer: {
        name: order.customerName,
        email: order.customerEmail,
        phone: order.customerPhone,
      },
      shipping: {
        street: order.shippingStreet,
        city: order.shippingCity,
        state: order.shippingState,
        zip: order.shippingZip,
        country: order.shippingCountry,
      },
      items: order.items.map((item) => ({
        variantId: item.variantId,
        productName: item.variant.product.name,
        quantity: item.quantity,
        price: item.price,
      })),
      createdAt: order.createdAt,
    }));
  }

  async getOrder(userId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
      include: {
        items: {
          include: {
            variant: { include: { product: { select: { name: true } } } },
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found.');
    }

    return {
      id: order.id,
      status: order.status,
      paymentMethod: order.paymentMethod,
      total: order.total,
      isPaid: order.isPaid,
      customer: {
        name: order.customerName,
        email: order.customerEmail,
        phone: order.customerPhone,
      },
      shipping: {
        street: order.shippingStreet,
        city: order.shippingCity,
        state: order.shippingState,
        zip: order.shippingZip,
        country: order.shippingCountry,
      },
      items: order.items.map((item) => ({
        variantId: item.variantId,
        productName: item.variant.product.name,
        quantity: item.quantity,
        price: item.price,
      })),
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  }

  private async getCartSnapshot(tx: Prisma.TransactionClient, userId: string) {
    const cart = await tx.cart.findUnique({
      where: { userId },
      include: {
        store: { select: { id: true, name: true, city: true, country: true } },
        items: {
          include: {
            inventory: {
              include: {
                variant: {
                  include: { product: { select: { name: true } } },
                },
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!cart) {
      return { store: null, items: [], totals: { subtotal: 0, itemCount: 0 } };
    }

    const items = cart.items.map((item) => {
      const price = item.inventory.storePrice ?? item.inventory.variant.price;
      return {
        inventoryId: item.inventoryId,
        variantId: item.inventory.variantId,
        productName: item.inventory.variant.product.name,
        quantity: item.quantity,
        unitPrice: price,
        lineTotal: price * item.quantity,
      };
    });

    return {
      id: cart.id,
      store: cart.store,
      items,
      totals: {
        subtotal: items.reduce((sum, item) => sum + item.lineTotal, 0),
        itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
      },
    };
  }
}
