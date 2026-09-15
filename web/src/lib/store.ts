export type Category = {
  id: string;
  slug: string;
  name: string;
  /** Обложка категории на витрине (URL или data URL); иначе — картинки по slug из /public */
  imageUrl?: string;
  memoryOptions?: string[];
};

export type Product = {
  id: string;
  categorySlug: string;
  name: string;
  color?: string;
  description?: string;
  basePrice: number;
  /** Старая цена (перечёркнутая). Необязательная. */
  compareAtPrice?: number;
  memoryPrices?: Record<string, number>;
  variants?: ProductVariant[];
  imageUrl: string;
};

export type ProductVariant = {
  color?: string;
  memory?: string;
  simType?: string;
  screen?: string;
  ram?: string;
  price: number;
  compareAtPrice?: number;
  imageUrl?: string;
  /** in_stock | coming_soon | out_of_stock | unknown */
  availability?: string;
};

export type StoreData = {
  categories: Category[];
  products: Product[];
  buybackConfig?: BuybackConfig;
  sliderPhotos?: SliderPhoto[];
};

export type BuybackConfig = {
  models: string[];
  memories: string[];
  simTypes: string[];
  conditions: string[];
};

export type SliderPhoto = {
  id: string;
  title?: string;
  imageUrl: string;
  position: number;
};

export const STORE_KEY = "xstore-data-v1";

export const defaultStoreData: StoreData = {
  categories: [
    { id: "c1", slug: "iphone", name: "iPhone", memoryOptions: ["256 ГБ", "512 ГБ", "1 ТБ"] },
    { id: "c7", slug: "iphone-used", name: "iPhone Б/У", memoryOptions: ["256 ГБ", "512 ГБ", "1 ТБ"] },
    { id: "c2", slug: "macbook", name: "MacBook", memoryOptions: ["256 ГБ", "512 ГБ", "1 ТБ"] },
    { id: "c3", slug: "apple-watch", name: "Apple Watch" },
    { id: "c4", slug: "ipad", name: "iPad", memoryOptions: ["128 ГБ", "256 ГБ", "512 ГБ"] },
    { id: "c5", slug: "airpods", name: "AirPods" },
    { id: "c8", slug: "dyson", name: "Dyson" },
    { id: "c9", slug: "consoles", name: "Игровые консоли" },
    { id: "c6", slug: "custom", name: "Под заказ" }
  ],
  products: [
    {
      id: "p1",
      categorySlug: "iphone",
      name: "iPhone 15 Pro Max",
      color: "Natural Titanium",
      description:
        "Флагман с титановым корпусом, продвинутой камерой и высокой производительностью для фото, видео и повседневных задач.",
      basePrice: 109990,
      compareAtPrice: 129990,
      memoryPrices: {
        "256 ГБ": 109990,
        "512 ГБ": 124990,
        "1 ТБ": 139990
      },
      imageUrl: "https://images.unsplash.com/photo-1695048132842-b41495f12eb4?w=600&q=80"
    },
    {
      id: "p2",
      categorySlug: "iphone",
      name: "iPhone 14 Pro",
      color: "Deep Purple",
      description:
        "Мощный смартфон с ярким дисплеем, отличной автономностью и сбалансированными характеристиками для работы и развлечений.",
      basePrice: 91990,
      compareAtPrice: 109990,
      memoryPrices: {
        "256 ГБ": 91990,
        "512 ГБ": 102990,
        "1 ТБ": 117990
      },
      imageUrl: "https://images.unsplash.com/photo-1678685888221-cda773a3dcdb?w=600&q=80"
    },
    {
      id: "p7",
      categorySlug: "iphone-used",
      name: "iPhone 14 Pro",
      color: "Deep Purple",
      description:
        "Б/У устройство после диагностики: аккумулятор, дисплей и камеры проверены. Подходит для повседневных задач и экономии бюджета.",
      basePrice: 72990,
      memoryPrices: {
        "256 ГБ": 72990,
        "512 ГБ": 84990,
        "1 ТБ": 96990
      },
      imageUrl: "https://images.unsplash.com/photo-1678685888221-cda773a3dcdb?w=600&q=80"
    },
    {
      id: "p3",
      categorySlug: "macbook",
      name: "MacBook Air M2 13\"",
      color: "Midnight",
      description:
        "Легкий и тихий ноутбук для учебы и работы: быстрый чип M2, качественный экран и длительное время автономной работы.",
      basePrice: 124990,
      memoryPrices: {
        "256 ГБ": 124990,
        "512 ГБ": 139990,
        "1 ТБ": 164990
      },
      imageUrl: "https://images.unsplash.com/photo-1517336714739-489689fd1ca8?w=600&q=80"
    },
    {
      id: "p4",
      categorySlug: "airpods",
      name: "AirPods Pro 2",
      color: "White",
      description:
        "Беспроводные наушники с активным шумоподавлением, прозрачным режимом и удобной интеграцией с устройствами Apple.",
      basePrice: 24990,
      compareAtPrice: 29990,
      imageUrl: "https://images.unsplash.com/photo-1606220945770-b5b6c2c55bf1?w=600&q=80"
    },
    {
      id: "p5",
      categorySlug: "ipad",
      name: "iPad Air 11\"",
      color: "Space Gray",
      description:
        "Универсальный планшет для контента, учебы и творчества: мощная начинка, компактный формат и поддержка аксессуаров.",
      basePrice: 73990,
      memoryPrices: {
        "128 ГБ": 73990,
        "256 ГБ": 82990,
        "512 ГБ": 96990
      },
      imageUrl: "https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?w=600&q=80"
    },
    {
      id: "p6",
      categorySlug: "apple-watch",
      name: "Apple Watch Series 9",
      color: "Starlight",
      description:
        "Умные часы для спорта и повседневной активности: мониторинг здоровья, уведомления и удобная синхронизация с iPhone.",
      basePrice: 42990,
      imageUrl: "https://images.unsplash.com/photo-1579586337278-3f436f25d4d4?w=600&q=80"
    }
  ],
  buybackConfig: {
    models: ["iPhone 11", "iPhone 12", "iPhone 13", "iPhone 14", "iPhone 15", "iPhone 16"],
    memories: ["64 ГБ", "128 ГБ", "256 ГБ", "512 ГБ", "1 ТБ"],
    simTypes: ["eSIM", "nano-SIM", "eSIM + nano-SIM"],
    conditions: ["Отличное", "Хорошее", "Среднее", "Плохое"]
  },
  sliderPhotos: []
};

function normalizeStoreData(input: StoreData): StoreData {
  const categories = (input.categories || []).map((item) => ({
    id: item.id,
    slug: item.slug,
    name: item.name,
    imageUrl: typeof item.imageUrl === "string" && item.imageUrl.trim() ? item.imageUrl.trim() : undefined,
    memoryOptions: Array.isArray(item.memoryOptions) ? item.memoryOptions.filter(Boolean) : []
  }));

  const products = (input.products || []).map((raw) => {
    const normalizedMemoryPrices: Record<string, number> = {};
    const normalizedVariants: ProductVariant[] = [];
    const rawMemoryPrices = raw.memoryPrices as unknown;

    if (
      rawMemoryPrices &&
      typeof rawMemoryPrices === "object" &&
      !Array.isArray(rawMemoryPrices) &&
      "variants" in (rawMemoryPrices as Record<string, unknown>)
    ) {
      const maybeVariants = (rawMemoryPrices as { variants?: unknown }).variants;
      if (Array.isArray(maybeVariants)) {
        for (const item of maybeVariants) {
          if (!item || typeof item !== "object") continue;
          const candidate = item as Record<string, unknown>;
          const price = Number(candidate.price);
          if (!Number.isFinite(price)) continue;
          normalizedVariants.push({
            color: typeof candidate.color === "string" ? candidate.color.trim() || undefined : undefined,
            memory: typeof candidate.memory === "string" ? candidate.memory.trim() || undefined : undefined,
            simType: typeof candidate.simType === "string" ? candidate.simType.trim() || undefined : undefined,
            screen: typeof candidate.screen === "string" ? candidate.screen.trim() || undefined : undefined,
            ram: typeof candidate.ram === "string" ? candidate.ram.trim() || undefined : undefined,
            price,
            compareAtPrice: parseOptionalCompareAt(candidate.compareAtPrice),
            imageUrl: typeof candidate.imageUrl === "string" ? candidate.imageUrl.trim() || undefined : undefined,
            availability:
              typeof candidate.availability === "string" && candidate.availability.trim()
                ? candidate.availability.trim().toLowerCase()
                : undefined
          });
        }
      }
    }

    if (raw.memoryPrices && typeof raw.memoryPrices === "object") {
      for (const [key, value] of Object.entries(raw.memoryPrices)) {
        if (key === "variants") continue;
        const nextPrice = Number(value);
        if (key && Number.isFinite(nextPrice)) {
          normalizedMemoryPrices[key] = nextPrice;
        }
      }
    }

    // Backward compatibility for old records with `price`.
    const maybeOldPrice = Number((raw as Product & { price?: number }).price);
    const basePrice = Number.isFinite(raw.basePrice) ? raw.basePrice : maybeOldPrice;

    return {
      id: raw.id,
      categorySlug: raw.categorySlug,
      name: raw.name,
      color: typeof raw.color === "string" ? raw.color.trim() : undefined,
      description: typeof raw.description === "string" ? raw.description.trim() : undefined,
      basePrice: Number.isFinite(basePrice) ? basePrice : 0,
      compareAtPrice: parseOptionalCompareAt((raw as Product).compareAtPrice),
      memoryPrices: Object.keys(normalizedMemoryPrices).length ? normalizedMemoryPrices : undefined,
      variants: normalizedVariants.length ? normalizedVariants : undefined,
      imageUrl: raw.imageUrl
    };
  });

  const fallback = defaultStoreData.buybackConfig ?? { models: [], memories: [], simTypes: [], conditions: [] };
  const rawBuyback = input.buybackConfig;
  const buybackConfig: BuybackConfig = {
    models: Array.isArray(rawBuyback?.models) ? rawBuyback.models.filter(Boolean) : fallback.models,
    memories: Array.isArray(rawBuyback?.memories) ? rawBuyback.memories.filter(Boolean) : fallback.memories,
    simTypes: Array.isArray(rawBuyback?.simTypes) ? rawBuyback.simTypes.filter(Boolean) : fallback.simTypes,
    conditions: Array.isArray(rawBuyback?.conditions) ? rawBuyback.conditions.filter(Boolean) : fallback.conditions
  };
  const sliderPhotos = Array.isArray(input.sliderPhotos)
    ? input.sliderPhotos
        .map((item, index) => ({
          id: item.id,
          title: typeof item.title === "string" ? item.title.trim() || undefined : undefined,
          imageUrl: typeof item.imageUrl === "string" ? item.imageUrl.trim() : "",
          position: Number.isFinite(item.position) ? item.position : index
        }))
        .filter((item) => item.id && item.imageUrl)
        .sort((a, b) => a.position - b.position)
    : [];

  return { categories, products, buybackConfig, sliderPhotos };
}

export function loadStoreData(): StoreData {
  if (typeof window === "undefined") {
    return defaultStoreData;
  }

  const raw = window.localStorage.getItem(STORE_KEY);
  if (!raw) {
    return defaultStoreData;
  }

  try {
    const parsed = JSON.parse(raw) as StoreData;
    if (!parsed.categories || !parsed.products) {
      return defaultStoreData;
    }
    return normalizeStoreData(parsed);
  } catch {
    return defaultStoreData;
  }
}

export function saveStoreData(data: StoreData): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(STORE_KEY, JSON.stringify(data));
}

export function toRub(price: number): string {
  return new Intl.NumberFormat("ru-RU").format(price) + " ₽";
}

export function parseOptionalCompareAt(value: unknown): number | undefined {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.round(n);
}

/** Скидка в целых процентах: (старая − текущая) / старая. */
export function priceDiscountPercent(price: number, compareAtPrice?: number): number | null {
  if (!compareAtPrice || compareAtPrice <= 0 || price <= 0 || compareAtPrice <= price) {
    return null;
  }
  const percent = Math.round(((compareAtPrice - price) / compareAtPrice) * 100);
  return percent > 0 ? percent : null;
}

export function resolveCompareAtPrice(
  price: number,
  variant?: Pick<ProductVariant, "compareAtPrice"> | null,
  product?: Pick<Product, "compareAtPrice">
): number | undefined {
  const raw = parseOptionalCompareAt(variant?.compareAtPrice ?? product?.compareAtPrice);
  if (!raw || raw <= price) return undefined;
  return raw;
}
