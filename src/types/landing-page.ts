export type LandingPageTheme = {
  primaryColor: string;
  backgroundColor: string;
  surfaceColor: string;
  textColor: string;
  fontStyle: "MODERN" | "CLASSIC";
  buttonStyle: "ROUNDED" | "PILL" | "SQUARE";
};

export type LandingPageCommerceSettings = {
  orderingEnabled: boolean;
  cartButtonLabel: string;
  cartButtonPosition: "BOTTOM_RIGHT" | "BOTTOM_LEFT";
  fulfillmentMethods: Array<"PICKUP" | "DELIVERY">;
  paymentMethods: Array<"PAY_ON_PICKUP" | "CASH_ON_DELIVERY">;
  checkoutInstructions: string;
  minimumOrder: number;
  deliveryFee: number;
};

export const defaultLandingPageCommerceSettings: LandingPageCommerceSettings = {
  orderingEnabled: true,
  cartButtonLabel: "Cart",
  cartButtonPosition: "BOTTOM_RIGHT",
  fulfillmentMethods: ["PICKUP", "DELIVERY"],
  paymentMethods: ["PAY_ON_PICKUP", "CASH_ON_DELIVERY"],
  checkoutInstructions: "The owner will review your order before confirming it.",
  minimumOrder: 0,
  deliveryFee: 0,
};

export type LandingPageComponentType =
  | "HERO"
  | "TEXT"
  | "MENU"
  | "CATALOG"
  | "GALLERY"
  | "CONTACT"
  | "CTA";
export type LandingPageComponentWidth = "FULL" | "TWO_THIRDS" | "HALF" | "THIRD";
export type LandingPageSectionContentWidth = "FULL" | "WIDE" | "CONTAINED";
export type LandingPageSectionSpacing = "NONE" | "SMALL" | "MEDIUM" | "LARGE";

type BaseComponent<T extends LandingPageComponentType, C> = {
  id: string;
  type: T;
  enabled: boolean;
  width: LandingPageComponentWidth;
  content: C;
};

export type HeroComponent = BaseComponent<
  "HERO",
  {
    eyebrow: string;
    title: string;
    body: string;
    mediaUrl: string;
    primaryLabel: string;
    primaryUrl: string;
    secondaryLabel: string;
    secondaryUrl: string;
  }
>;
export type TextComponent = BaseComponent<
  "TEXT",
  { heading: string; body: string; alignment: "LEFT" | "CENTER" }
>;
export type MenuComponent = BaseComponent<
  "MENU",
  { heading: string; body: string; menuItemIds: string[]; columns: 2 | 3 | 4 }
>;
export type CatalogComponent = BaseComponent<
  "CATALOG",
  {
    heading: string;
    body: string;
    catalogItemRefs: Array<{ sourceType: "MENU_ITEM" | "PRODUCT"; sourceId: string }>;
    columns: 2 | 3 | 4;
  }
>;
export type GalleryComponent = BaseComponent<
  "GALLERY",
  { heading: string; mediaUrls: string[]; columns: 2 | 3 | 4 }
>;
export type ContactComponent = BaseComponent<
  "CONTACT",
  {
    heading: string;
    body: string;
    address: string;
    phone: string;
    email: string;
    hours: string;
    facebookUrl: string;
    instagramUrl: string;
    mapUrl: string;
  }
>;
export type CtaComponent = BaseComponent<
  "CTA",
  { heading: string; body: string; buttonLabel: string; buttonUrl: string }
>;

export type LandingPageComponent =
  | HeroComponent
  | TextComponent
  | MenuComponent
  | CatalogComponent
  | GalleryComponent
  | ContactComponent
  | CtaComponent;

export type LandingPageSection = {
  id: string;
  name: string;
  enabled: boolean;
  backgroundColor: string;
  textColor: string;
  contentWidth: LandingPageSectionContentWidth;
  padding: LandingPageSectionSpacing;
  gap: LandingPageSectionSpacing;
  components: LandingPageComponent[];
};

export type LandingPageVariant = {
  _id: string;
  name: string;
  theme: LandingPageTheme;
  commerce: LandingPageCommerceSettings;
  sections: LandingPageSection[];
  createdAt?: string;
  updatedAt?: string;
};

export type LandingPageVariantPayload = Omit<LandingPageVariant, "commerce" | "sections"> & {
  commerce?: Partial<LandingPageCommerceSettings>;
  sections?: LandingPageSection[];
  components?: LandingPageComponent[];
};

export type LandingPageRecord = {
  _id: string;
  slug: string;
  siteTitle: string;
  seoDescription: string;
  isPublished: boolean;
  publishedVariantId?: string;
  publishedAt?: string;
};

export type LandingMenuItem = {
  _id: string;
  name: string;
  category?: string;
  mediaUrls?: string[];
  googleDriveUrl?: string;
  googleDriveUrls?: string[];
  sellingPricePerServing?: string;
  isAvailable?: boolean;
};

export type LandingCatalogVariant = {
  originalPrice?: string | number;
  discountedPrice?: string | number;
  variantId: string;
  name: string;
  attributes: Array<{ name: string; value: string }>;
  price: string | number;
  isAvailable: boolean;
};

export type LandingCatalogItem = {
  originalPrice?: string | number;
  discountedPrice?: string | number;
  discount?: import("@/lib/catalog-discounts").ProductDiscount | null;
  key: string;
  sourceType: "MENU_ITEM" | "PRODUCT";
  sourceId: string;
  name: string;
  description: string;
  category?: string;
  productType: "FOOD" | "CLOTHING" | "FARM_PRODUCT" | "MERCHANDISE" | "OTHER";
  mediaUrls: string[];
  price: string | number;
  variants: LandingCatalogVariant[];
  isFeatured: boolean;
  isAvailable: boolean;
};

export type LandingPageBuilderData = {
  page: LandingPageRecord | null;
  variants: LandingPageVariant[];
  menuItems: LandingMenuItem[];
  catalogItems: LandingCatalogItem[];
};

export function createLandingComponent(type: LandingPageComponentType): LandingPageComponent {
  const base = { id: crypto.randomUUID(), enabled: true, width: "FULL" as const };
  if (type === "HERO")
    return {
      ...base,
      type,
      content: {
        eyebrow: "Welcome",
        title: "Your headline",
        body: "Share what makes your business special.",
        mediaUrl: "",
        primaryLabel: "Contact us",
        primaryUrl: "#contact",
        secondaryLabel: "",
        secondaryUrl: "",
      },
    };
  if (type === "TEXT")
    return {
      ...base,
      type,
      content: { heading: "Your story", body: "Add your message here.", alignment: "LEFT" },
    };
  if (type === "MENU")
    return {
      ...base,
      type,
      content: { heading: "Featured menu", body: "", menuItemIds: [], columns: 3 },
    };
  if (type === "CATALOG")
    return {
      ...base,
      type,
      content: {
        heading: "Featured products",
        body: "Order food, clothing, and other products from our business.",
        catalogItemRefs: [],
        columns: 3,
      },
    };
  if (type === "GALLERY")
    return { ...base, type, content: { heading: "Gallery", mediaUrls: [], columns: 3 } };
  if (type === "CONTACT")
    return {
      ...base,
      type,
      content: {
        heading: "Contact us",
        body: "",
        address: "",
        phone: "",
        email: "",
        hours: "",
        facebookUrl: "",
        instagramUrl: "",
        mapUrl: "",
      },
    };
  return {
    ...base,
    type: "CTA",
    content: {
      heading: "Ready to order?",
      body: "Get in touch with us today.",
      buttonLabel: "Contact us",
      buttonUrl: "#contact",
    },
  };
}

export function createLandingSection(
  name = "New section",
  components: LandingPageComponent[] = [],
): LandingPageSection {
  return {
    id: crypto.randomUUID(),
    name,
    enabled: true,
    backgroundColor: "",
    textColor: "",
    contentWidth: "WIDE",
    padding: "MEDIUM",
    gap: "MEDIUM",
    components,
  };
}

export function normalizeLandingSections(source: {
  sections?: LandingPageSection[];
  components?: LandingPageComponent[];
}): LandingPageSection[] {
  if (source.sections?.length) return source.sections;
  return [
    {
      id: "legacy-main-section",
      name: "Main section",
      enabled: true,
      backgroundColor: "",
      textColor: "",
      contentWidth: "WIDE",
      padding: "MEDIUM",
      gap: "MEDIUM",
      components: source.components ?? [],
    },
  ];
}

export function normalizeLandingPageVariant(
  variant: LandingPageVariantPayload,
): LandingPageVariant {
  return {
    ...variant,
    commerce: {
      ...defaultLandingPageCommerceSettings,
      ...variant.commerce,
      fulfillmentMethods:
        variant.commerce?.fulfillmentMethods ??
        defaultLandingPageCommerceSettings.fulfillmentMethods,
      paymentMethods:
        variant.commerce?.paymentMethods ?? defaultLandingPageCommerceSettings.paymentMethods,
    },
    sections: normalizeLandingSections(variant),
  };
}
