export const INVENTORY_EVENT_TYPES = {
  CREATED: 'inventory.created',
  UPDATED: 'inventory.updated',
  DELETED: 'inventory.deleted',
  RESERVED: 'inventory.reserved',
  RELEASED: 'inventory.released',
  CAPTURED: 'inventory.captured',
} as const;

export const CART_EVENT_TYPES = {
  ITEM_ADDED: 'cart.item.added',
  ITEM_UPDATED: 'cart.item.updated',
  ITEM_REMOVED: 'cart.item.removed',
  CLEARED: 'cart.cleared',
} as const;

export const CHECKOUT_EVENT_TYPES = {
  STARTED: 'checkout.started',
  COMPLETED: 'checkout.completed',
  FAILED: 'checkout.failed',
} as const;

export const ORDER_EVENT_TYPES = {
  PLACED: 'order.placed',
  CANCELLED: 'order.cancelled',
} as const;

export type InventoryEventType =
  (typeof INVENTORY_EVENT_TYPES)[keyof typeof INVENTORY_EVENT_TYPES];

export type CartEventType =
  (typeof CART_EVENT_TYPES)[keyof typeof CART_EVENT_TYPES];

export type CheckoutEventType =
  (typeof CHECKOUT_EVENT_TYPES)[keyof typeof CHECKOUT_EVENT_TYPES];

export type OrderEventType =
  (typeof ORDER_EVENT_TYPES)[keyof typeof ORDER_EVENT_TYPES];
