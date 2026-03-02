export interface InventoryWithPricing {
  id: string;
  tenantId: string;
  storeId: string;
  productId: string;
  variantId: string;
  stockQty: number;
  reservedQty: number;
  availableQty: number;
  lowStock: number;
  isDeleted: boolean;
  price: number;
  costPrice: number;
  mrp: number | null;
  storePrice: number | null;
  storeCostPrice: number | null;
  storeMrp: number | null;
  updatedAt: Date;
}
