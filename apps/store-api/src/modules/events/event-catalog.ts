export const INVENTORY_EVENT_TYPES = {
  CREATED: 'inventory.created',
  UPDATED: 'inventory.updated',
  DELETED: 'inventory.deleted',
  RESERVED: 'inventory.reserved',
  RELEASED: 'inventory.released',
  CAPTURED: 'inventory.captured',
} as const;

export type InventoryEventType =
  (typeof INVENTORY_EVENT_TYPES)[keyof typeof INVENTORY_EVENT_TYPES];
