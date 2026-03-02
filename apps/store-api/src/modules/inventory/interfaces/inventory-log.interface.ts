import { InventoryAction } from './inventory-action.enum';

export interface InventoryLog {
  inventoryId: string;
  tenantId: string;
  storeId: string;
  productId: string;
  variantId: string;
  action: InventoryAction;
  previousStock: number;
  newStock: number;
  changedBy?: string;
  timestamp: string;
}
