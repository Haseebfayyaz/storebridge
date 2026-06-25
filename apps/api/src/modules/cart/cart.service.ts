import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PaymentMethod, Prisma } from '@prisma/client';
import {
  CART_EVENT_TYPES,
  CHECKOUT_EVENT_TYPES,
  ORDER_EVENT_TYPES,
  OutboxService,
} from 'common';
import { PrismaService } from 'database';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';
import { UpsertAddressDto } from './dto/upsert-address.dto';
import { InventoryService } from '../inventory/inventory.service';

@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
    private readonly outboxService: OutboxService,
  ) {}

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
                    product: {
                      select: { id: true, name: true, description: true },
                    },
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
      const inventory = await this.inventoryService.getCartInventoryRecord(
        tx,
        dto.inventoryId,
      );

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
        where: {
          cartId_inventoryId: { cartId: cart.id, inventoryId: dto.inventoryId },
        },
      });

      await this.inventoryService.reserveStock(
        tx,
        dto.inventoryId,
        dto.quantity,
      );

      if (existing) {
        await tx.cartItem.update({
          where: { id: existing.id },
          data: { quantity: existing.quantity + dto.quantity },
        });
      } else {
        await tx.cartItem.create({
          data: {
            cartId: cart.id,
            inventoryId: dto.inventoryId,
            quantity: dto.quantity,
          },
        });
      }

      await this.recordCartEvent(tx, {
        eventType: CART_EVENT_TYPES.ITEM_ADDED,
        aggregateId: cart.id,
        payload: {
          cartId: cart.id,
          userId,
          storeId: cart.storeId,
          inventoryId: dto.inventoryId,
          quantity: dto.quantity,
          newQuantity: existing
            ? existing.quantity + dto.quantity
            : dto.quantity,
        },
      });

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
        where: {
          cartId_inventoryId: { cartId: cart.id, inventoryId: dto.inventoryId },
        },
      });
      if (!item) {
        throw new NotFoundException('Cart item not found');
      }

      const delta = dto.quantity - item.quantity;
      if (delta > 0) {
        await this.inventoryService.reserveStock(tx, dto.inventoryId, delta);
      } else if (delta < 0) {
        await this.inventoryService.releaseStock(
          tx,
          dto.inventoryId,
          Math.abs(delta),
        );
      }

      await tx.cartItem.update({
        where: { id: item.id },
        data: { quantity: dto.quantity },
      });

      await this.recordCartEvent(tx, {
        eventType: CART_EVENT_TYPES.ITEM_UPDATED,
        aggregateId: cart.id,
        payload: {
          cartId: cart.id,
          userId,
          storeId: cart.storeId,
          inventoryId: dto.inventoryId,
          previousQuantity: item.quantity,
          quantity: dto.quantity,
          delta,
        },
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

      await this.inventoryService.releaseStock(tx, inventoryId, item.quantity);

      await tx.cartItem.delete({ where: { id: item.id } });

      const remainingCount = await tx.cartItem.count({
        where: { cartId: cart.id },
      });
      if (remainingCount === 0) {
        await tx.cart.delete({ where: { id: cart.id } });
      }

      await this.recordCartEvent(tx, {
        eventType: CART_EVENT_TYPES.ITEM_REMOVED,
        aggregateId: cart.id,
        payload: {
          cartId: cart.id,
          userId,
          storeId: cart.storeId,
          inventoryId,
          quantity: item.quantity,
          cartDeleted: remainingCount === 0,
        },
      });

      if (remainingCount === 0) {
        await this.recordCartEvent(tx, {
          eventType: CART_EVENT_TYPES.CLEARED,
          aggregateId: cart.id,
          payload: {
            cartId: cart.id,
            userId,
            storeId: cart.storeId,
            itemCount: 0,
            reason: 'removed-last-item',
          },
        });
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
      const cart = await this.getCartForCheckout(tx, userId);
      const checkoutQuote = await this.inventoryService.buildCheckoutQuote(
        tx,
        cart.storeId,
        cart.items,
      );
      const shipping = await this.resolveCheckoutShipping(tx, userId, dto);

      await this.inventoryService.captureCheckoutStock(tx, cart.items);

      const order = await tx.order.create({
        data: {
          userId,
          storeId: cart.storeId,
          total: checkoutQuote.total,
          status: 'PENDING',
          paymentMethod: (dto.paymentMethod ?? 'COD') as PaymentMethod,
          isPaid: false,
          ...shipping,
          items: {
            create: checkoutQuote.items.map((item) => ({
              variantId: item.variantId,
              quantity: item.quantity,
              price: item.price,
            })),
          },
        },
        include: {
          items: {
            include: {
              variant: { include: { product: { select: { name: true } } } },
            },
          },
        },
      });

      await this.clearCart(tx, cart.id);
      await this.recordCheckoutEvent(tx, {
        eventType: CHECKOUT_EVENT_TYPES.COMPLETED,
        aggregateType: 'Checkout',
        aggregateId: order.id,
        payload: {
          orderId: order.id,
          cartId: cart.id,
          userId,
          storeId: cart.storeId,
          total: checkoutQuote.total,
          paymentMethod: order.paymentMethod,
          itemCount: order.items.length,
          shipping,
        },
      });
      await this.recordCheckoutEvent(tx, {
        eventType: ORDER_EVENT_TYPES.PLACED,
        aggregateType: 'Order',
        aggregateId: order.id,
        payload: {
          orderId: order.id,
          cartId: cart.id,
          userId,
          storeId: cart.storeId,
          total: checkoutQuote.total,
          paymentMethod: order.paymentMethod,
          itemCount: order.items.length,
          shipping,
        },
      });
      await this.recordCartEvent(tx, {
        eventType: CART_EVENT_TYPES.CLEARED,
        aggregateId: cart.id,
        payload: {
          cartId: cart.id,
          userId,
          storeId: cart.storeId,
          itemCount: cart.items.length,
          orderId: order.id,
        },
      });

      return this.mapOrderSummary(order);
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

  private async getCartForCheckout(
    tx: Prisma.TransactionClient,
    userId: string,
  ) {
    const cart = await tx.cart.findUnique({
      where: { userId },
      include: { items: true },
    });

    if (!cart || cart.items.length === 0) {
      throw new BadRequestException('Cart is empty');
    }

    return cart;
  }

  private async resolveCheckoutShipping(
    tx: Prisma.TransactionClient,
    userId: string,
    dto: CreateOrderDto,
  ) {
    const addressFromDb = dto.addressId
      ? await tx.address.findFirst({ where: { id: dto.addressId, userId } })
      : await tx.address.findFirst({
          where: { userId },
          orderBy: { createdAt: 'desc' },
        });

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

    if (
      !shipping.customerName ||
      !shipping.customerPhone ||
      !shipping.shippingStreet
    ) {
      throw new BadRequestException(
        'Address and personal details are required to place order',
      );
    }

    return shipping;
  }

  private async clearCart(tx: Prisma.TransactionClient, cartId: string) {
    await tx.cartItem.deleteMany({ where: { cartId } });
    await tx.cart.delete({ where: { id: cartId } });
  }

  private recordCartEvent(
    tx: Prisma.TransactionClient,
    event: {
      eventType: string;
      aggregateId: string;
      payload: Prisma.InputJsonValue;
    },
  ) {
    return this.outboxService.enqueue(tx, {
      eventType: event.eventType,
      aggregateType: 'Cart',
      aggregateId: event.aggregateId,
      payload: event.payload,
    });
  }

  private recordCheckoutEvent(
    tx: Prisma.TransactionClient,
    event: {
      eventType: string;
      aggregateType: string;
      aggregateId: string;
      payload: Prisma.InputJsonValue;
    },
  ) {
    return this.outboxService.enqueue(tx, event);
  }

  private mapOrderSummary(order: {
    id: string;
    status: string;
    paymentMethod: PaymentMethod;
    total: number;
    items: Array<{
      variantId: string;
      quantity: number;
      price: number;
      variant: { product: { name: string } };
    }>;
  }) {
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
  }
}
