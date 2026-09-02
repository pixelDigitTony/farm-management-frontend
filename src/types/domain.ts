export type Money = string | number;
export type Dashboard = {
  accounts: Array<{ _id: string; name: string; accountType: string; currentBalanceCached: Money }>;
  metrics: {
    activePigs: number;
    slaughteredPigs: number;
    receivables: Money;
    payables: Money;
    monthCashIn: Money;
    monthCashOut: Money;
    netCashFlow: Money;
    piggeryRevenue: Money;
    piggeryProfit: Money;
    karenderiyaRevenue: Money;
    karenderiyaProfit: Money;
    piggeryExpenses: Money;
    karenderiyaExpenses: Money;
  };
  lowStock: Array<{ _id: string; name: string; currentStockCached: Money; baseUnit: string }>;
  menuItems: MenuItem[];
  recentTransactions: Array<{
    _id: string;
    transactionDate: string;
    description: string;
    transactionType: string;
    amount: Money;
    businessUnit: string;
  }>;
};
export type Pig = {
  _id: string;
  pigCode: string;
  earTag?: string;
  sex: string;
  breed?: string;
  currentPen?: string;
  latestWeightKgCached?: Money;
  accumulatedCostCached: Money;
  purchaseCost: Money;
  status: string;
  acquisitionDate?: string;
};
export type InventoryItem = {
  _id: string;
  itemCode: string;
  name: string;
  businessUnit: string;
  category: string;
  baseUnit: string;
  purchaseUnit?: string;
  purchaseUnitToBaseUnit?: Money;
  currentStockCached: Money;
  lowStockLevel?: Money;
  defaultExternalPricePerUnit?: Money;
  defaultKarenderiyaTransferPricePerUnit?: Money;
  isPerishable?: boolean;
};
export type MenuItem = {
  _id: string;
  menuCode: string;
  name: string;
  category?: string;
  mediaUrls?: string[];
  googleDriveUrl?: string | null;
  googleDriveUrls?: string[];
  recipeId: string;
  sellingPricePerServing: Money;
  targetFoodCostPercent: Money;
  calculatedCostPerServingCached: Money;
  calculatedProfitPerServingCached: Money;
  calculatedFoodCostPercentCached: Money;
  suggestedSellingPriceCached: Money;
  isAvailable: boolean;
};

export type Recipe = {
  _id: string;
  recipeCode: string;
  name: string;
  yieldServings: Money;
  ingredients: Array<{
    inventoryItemId: string;
    itemNameSnapshot?: string;
    quantity: Money;
    unit?: string;
  }>;
  preparationCosts?: Array<{ name: string; amount: Money }>;
};

export type KarenderiyaOrder = {
  _id: string;
  salesNumber: string;
  salesDate: string;
  items: Array<{
    menuItemId: string;
    menuNameSnapshot: string;
    quantitySold: Money;
    netAmount: Money;
  }>;
  netSales: Money;
  grossProfit: Money;
  notes?: string;
  status: string;
};

export type CalendarTodo = {
  _id: string;
  businessId: string;
  createdByUserId: string;
  assignedToUserId?: string | null;
  title: string;
  notes?: string;
  calendarDate: string;
  startTime?: string | null;
  category: "GENERAL" | "FARM" | "KARENDERIYA";
  priority: "LOW" | "NORMAL" | "HIGH";
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED";
  completedAt?: string | null;
  completedByUserId?: string | null;
  createdAt: string;
};

export type CatalogProductVariant = {
  originalPrice?: Money;
  discountedPrice?: Money;
  variantId: string;
  name: string;
  sku?: string;
  attributes: Array<{ name: string; value: string }>;
  price: Money;
  availableQuantity: number | null;
  isAvailable: boolean;
};

export type CatalogProduct = {
  originalPrice?: Money;
  discountedPrice?: Money;
  price?: Money;
  discount?: import("@/lib/catalog-discounts").ProductDiscount | null;
  _id: string;
  productCode: string;
  name: string;
  description: string;
  category: string;
  productType: "CLOTHING" | "FARM_PRODUCT" | "MERCHANDISE" | "OTHER";
  mediaUrls: string[];
  basePrice: Money;
  availableQuantity: number | null;
  variants: CatalogProductVariant[];
  isFeatured: boolean;
  isOrderable: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CustomerOrderStatus =
  | "PENDING"
  | "CONFIRMED"
  | "PROCESSING"
  | "READY"
  | "COMPLETED"
  | "CANCELLED";

export type CustomerOrder = {
  _id: string;
  orderNumber: string;
  sourceSlugSnapshot: string;
  customer: { name: string; phone: string; email?: string };
  fulfillmentMethod: "PICKUP" | "DELIVERY";
  deliveryAddress?: string;
  paymentMethod: "PAY_ON_PICKUP" | "CASH_ON_DELIVERY";
  items: Array<{
    sourceType: "MENU_ITEM" | "PRODUCT";
    sourceId: string;
    variantId?: string | null;
    nameSnapshot: string;
    categorySnapshot?: string;
    variantSnapshot?: string;
    mediaUrlSnapshot?: string;
    unitPrice: Money;
    originalUnitPrice?: Money | null;
    discountAmount?: Money | null;
    discountSnapshot?: {
      promotionId: string;
      name: string;
      type: "PERCENTAGE" | "FIXED";
      value: number;
    } | null;
    quantity: number;
    lineTotal: Money;
  }>;
  subtotal: Money;
  deliveryFee?: Money;
  total: Money;
  customerNotes?: string;
  status: CustomerOrderStatus;
  statusHistory: Array<{
    status: CustomerOrderStatus;
    changedAt: string;
    changedByUserId?: string;
    note?: string;
  }>;
  cancellationReason?: string;
  stockReserved: boolean;
  createdAt: string;
  updatedAt: string;
};
