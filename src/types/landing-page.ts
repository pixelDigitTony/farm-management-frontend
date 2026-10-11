import type * as v from "valibot";
import type {
  landingPageComponentSchema,
  landingPageSectionSchema,
  landingPageThemeSchema,
  landingPageCommerceSettingsSchema,
  motionSchema,
  mediaAssetSchema,
  actionTargetSchema,
  backgroundSchema,
} from "@/lib/landing-page/schema";
export { defaultLandingPageCommerceSettings } from "@/lib/landing-page/schema";
import { defaultLandingPageCommerceSettings } from "@/lib/landing-page/schema";
export type LandingPageTheme = v.InferOutput<typeof landingPageThemeSchema>;
export type LandingPageCommerceSettings = v.InferOutput<typeof landingPageCommerceSettingsSchema>;
export type LandingPageComponent = v.InferOutput<typeof landingPageComponentSchema>;
export type LandingPageComponentType = LandingPageComponent["type"];
export type LandingPageSection = Omit<
  v.InferOutput<typeof landingPageSectionSchema>,
  "maxHeight"
> & { maxHeight?: number };
export type LandingPageComponentWidth = LandingPageComponent["width"];
export type LandingPageSectionContentWidth = LandingPageSection["contentWidth"];
export type LandingPageSectionSpacing = LandingPageSection["padding"];
export type LandingPageDisplayMode = "VERTICAL" | "HORIZONTAL";
export type MediaAsset = v.InferOutput<typeof mediaAssetSchema>;
export type MotionSettings = v.InferOutput<typeof motionSchema>;
export type BackgroundSettings = v.InferOutput<typeof backgroundSchema>;
export type ActionTarget = v.InferOutput<typeof actionTargetSchema>;
export type TemplateId =
  | "bold-market"
  | "editorial-studio"
  | "architectural-escape"
  | "everyday-boutique"
  | "farm-and-market";
export type LandingGoal = "SHOP" | "CATALOG" | "INQUIRY";
export type HeroComponent = Extract<LandingPageComponent, { type: "HERO" }>;
export type TextComponent = Extract<LandingPageComponent, { type: "TEXT" }>;
export type MenuComponent = Extract<LandingPageComponent, { type: "MENU" }>;
export type CatalogComponent = Extract<LandingPageComponent, { type: "CATALOG" }>;
export type GalleryComponent = Extract<LandingPageComponent, { type: "GALLERY" }>;
export type ContactComponent = Extract<LandingPageComponent, { type: "CONTACT" }>;
export type CtaComponent = Extract<LandingPageComponent, { type: "CTA" }>;
export type LandingPageVariant = {
  _id: string;
  name: string;
  schemaVersion?: 1 | 2;
  template?: { id: TemplateId; revision: number };
  goal?: LandingGoal;
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
export type LandingTemplate = {
  id: TemplateId;
  revision: number;
  name: string;
  description: string;
  category: string;
  goal: LandingGoal;
  preview: string;
  mobilePreview: string;
  sections: string[];
  sceneId: string;
  orderingPreview?: string;
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
  showOnLandingPage?: boolean;
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
  if (type === "HEADER")
    return {
      ...base,
      type,
      content: {
        brand: "Your brand",
        tagline: "",
        navigation: [],
        messagingUrl: "",
        showSearch: true,
        showCart: true,
      },
    };
  if (type === "FOOTER")
    return { ...base, type, content: { brand: "Your brand", statement: "", legal: "", links: [] } };
  if (type === "FEATURES")
    return { ...base, type, content: { heading: "What makes us different", items: [] } };
  if (type === "SHOWCASE")
    return { ...base, type, content: { heading: "Explore our offerings", body: "", items: [] } };
  if (type === "MEDIA_STORY")
    return { ...base, type, content: { heading: "A closer look", body: "", frames: [] } };
  if (type === "TESTIMONIALS")
    return {
      ...base,
      type,
      content: { heading: "Customer stories", displayMode: "RAIL", entries: [] },
    };
  if (type === "FAQ")
    return { ...base, type, content: { heading: "Questions and answers", items: [] } };
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
      content: {
        heading: "Featured menu",
        body: "",
        menuItemIds: [],
        columns: 3,
        displayMode: "HORIZONTAL",
      },
    };
  if (type === "CATALOG")
    return {
      ...base,
      type,
      content: {
        heading: "Featured products",
        body: "Explore our collection.",
        catalogItemRefs: [],
        columns: 3,
        displayMode: "HORIZONTAL",
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
      heading: "Discover more",
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
    maxHeight: 0,
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
