import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "crypto";
import { Prisma, Product } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CreateCategoryDto } from "./dto/create-category.dto";
import { UpdateCategoryDto } from "./dto/update-category.dto";
import { UpsertSliderPhotosDto } from "./dto/upsert-slider-photos.dto";
import { UpsertProductDto } from "./dto/upsert-product.dto";
import { persistStoreImage } from "./image-store";
import { getCachedStore, invalidateStoreCache, setCachedStore } from "./store-cache";

type StoreCategory = {
  id: string;
  slug: string;
  name: string;
  imageUrl?: string;
  memoryOptions: string[];
};

type StoreProduct = {
  id: string;
  categorySlug: string;
  name: string;
  color?: string;
  description?: string;
  basePrice: number;
  compareAtPrice?: number;
  memoryPrices?: Record<string, number>;
  variants?: Array<{
    color?: string;
    memory?: string;
    simType?: string;
    screen?: string;
    ram?: string;
    price: number;
    compareAtPrice?: number;
    imageUrl?: string;
    availability?: string;
  }>;
  imageUrl: string;
};

type BuybackConfigPayload = {
  models: string[];
  memories: string[];
  simTypes: string[];
  conditions: string[];
};

type StoreSliderPhoto = {
  id: string;
  title?: string;
  imageUrl: string;
  position: number;
};

@Injectable()
export class StoreService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureSeedData() {
    try {
      await this.ensureProductCompareAtPriceColumn();
    } catch {
      // Колонка уже есть или БД ещё поднимается — migrate deploy добавит её отдельно.
    }
    try {
      await this.ensureSliderPhotoTable();
    } catch {
      // The store must remain available even if the optional gallery table needs manual migration.
    }

    const defaultCategories: Array<{ slug: string; name: string; memoryOptions: string[] }> = [
      { slug: "iphone", name: "iPhone", memoryOptions: ["256 ГБ", "512 ГБ", "1 ТБ"] },
      { slug: "iphone-used", name: "iPhone Б/У", memoryOptions: ["256 ГБ", "512 ГБ", "1 ТБ"] },
      { slug: "macbook", name: "MacBook", memoryOptions: ["256 ГБ", "512 ГБ", "1 ТБ"] },
      { slug: "apple-watch", name: "Apple Watch", memoryOptions: [] },
      { slug: "ipad", name: "iPad", memoryOptions: ["128 ГБ", "256 ГБ", "512 ГБ"] },
      { slug: "airpods", name: "AirPods", memoryOptions: [] },
      { slug: "dyson", name: "Dyson", memoryOptions: [] },
      { slug: "consoles", name: "Игровые консоли", memoryOptions: [] },
      { slug: "custom", name: "Под заказ", memoryOptions: [] }
    ];

    for (const category of defaultCategories) {
      await this.prisma.category.upsert({
        where: { slug: category.slug },
        create: {
          slug: category.slug,
          name: category.name,
          memoryOptions: category.memoryOptions.join("|")
        },
        update: {}
      });
    }

    await this.prisma.buybackConfig.upsert({
      where: { id: "main" },
      create: {
        id: "main",
        models: "iPhone 11|iPhone 12|iPhone 13|iPhone 14|iPhone 15|iPhone 16",
        memories: "64 ГБ|128 ГБ|256 ГБ|512 ГБ|1 ТБ",
        simTypes: "eSIM|nano-SIM|eSIM + nano-SIM",
        conditions: "Отличное|Хорошее|Среднее|Плохое"
      },
      update: {}
    });
  }

  async getStoreData() {
    const cached = getCachedStore();
    if (cached) return cached;

    const rawCategories = await this.prisma.category.findMany({
      orderBy: { createdAt: "asc" }
    });
    const categories = this.sortCategoriesForStore(rawCategories);
    const products = await this.prisma.product.findMany({
      include: { category: true },
      orderBy: { createdAt: "desc" }
    });
    const buyback = await this.getBuybackConfigRecordSafe();
    const sliderPhotos = await this.getSliderPhotosSafe();

    const data = {
      categories: categories.map((item) => this.toCategory(item)),
      products: products.map((item) => this.toProduct(item)),
      buybackConfig: this.toBuybackConfig(buyback),
      sliderPhotos
    };
    setCachedStore(data);
    return data;
  }

  /** Выносит data URL и внешние фото на диск. Карточки не удаляет: при ошибке URL остаётся как был. */
  async materializeInlineImages(): Promise<void> {
    const products = await this.prisma.product.findMany({ include: { category: true } });
    for (const product of products) {
      try {
        const imageUrl = (await persistStoreImage(product.imageUrl, product.id)) ?? product.imageUrl;
        const { variants } = this.readPricingPayload(product.memoryPrices);
        let variantsChanged = false;
        const nextVariants: typeof variants = [];
        for (const [index, variant] of variants.entries()) {
          const nextImage = variant.imageUrl
            ? await persistStoreImage(variant.imageUrl, `${product.id}-v${index}`)
            : undefined;
          if (nextImage && nextImage !== variant.imageUrl) variantsChanged = true;
          nextVariants.push({ ...variant, imageUrl: nextImage ?? variant.imageUrl });
        }
        const nextMemory = variantsChanged
          ? ({ variants: nextVariants } as Prisma.InputJsonValue)
          : (product.memoryPrices as Prisma.InputJsonValue);
        if (imageUrl !== product.imageUrl || variantsChanged) {
          await this.prisma.product.update({
            where: { id: product.id },
            data: {
              imageUrl,
              ...(variantsChanged ? { memoryPrices: nextMemory } : {})
            }
          });
        }
      } catch {
        // Карточка остаётся в БД с прежними полями.
      }
    }

    const categories = await this.prisma.category.findMany();
    for (const category of categories) {
      if (!category.imageUrl) continue;
      try {
        const imageUrl = await persistStoreImage(category.imageUrl, `cat-${category.id}`);
        if (imageUrl && imageUrl !== category.imageUrl) {
          await this.prisma.category.update({ where: { id: category.id }, data: { imageUrl } });
        }
      } catch {
        // ignore
      }
    }

    invalidateStoreCache();
  }

  async getBuybackConfig(): Promise<BuybackConfigPayload> {
    const buyback = await this.getBuybackConfigRecordSafe();
    return this.toBuybackConfig(buyback);
  }

  async upsertBuybackConfig(input: BuybackConfigPayload): Promise<BuybackConfigPayload> {
    const models = this.normalizeOptionList(input.models);
    const memories = this.normalizeOptionList(input.memories);
    const simTypes = this.normalizeOptionList(input.simTypes);
    const conditions = this.normalizeOptionList(input.conditions);
    const saved = await this.prisma.buybackConfig.upsert({
      where: { id: "main" },
      create: {
        id: "main",
        models: models.join("|"),
        memories: memories.join("|"),
        simTypes: simTypes.join("|"),
        conditions: conditions.join("|")
      },
      update: {
        models: models.join("|"),
        memories: memories.join("|"),
        simTypes: simTypes.join("|"),
        conditions: conditions.join("|")
      }
    });
    invalidateStoreCache();
    return this.toBuybackConfig(saved);
  }

  async createCategory(dto: CreateCategoryDto): Promise<StoreCategory> {
    const name = dto.name.trim();
    if (!name) {
      throw new BadRequestException("Название категории не может быть пустым");
    }
    const slug = this.createSlug(name);

    const created = await this.prisma.category.create({
      data: {
        name,
        slug,
        imageUrl: (await persistStoreImage(dto.imageUrl?.trim() || undefined, `cat-${slug}`)) || null,
        memoryOptions: (dto.memoryOptions ?? []).filter(Boolean).join("|")
      }
    });
    invalidateStoreCache();
    return this.toCategory(created);
  }

  async updateCategory(id: string, dto: UpdateCategoryDto): Promise<StoreCategory> {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) {
      throw new NotFoundException("Категория не найдена");
    }
    const data: Prisma.CategoryUpdateInput = {};
    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) {
        throw new BadRequestException("Название категории не может быть пустым");
      }
      data.name = name;
    }
    if (dto.imageUrl !== undefined) {
      const raw = dto.imageUrl.trim();
      if (!raw) {
        data.imageUrl = null;
      } else {
        data.imageUrl = (await persistStoreImage(raw, `cat-${id}`)) || raw;
      }
    }
    if (Object.keys(data).length === 0) {
      throw new BadRequestException("Укажите новое название и/или фото");
    }
    const saved = await this.prisma.category.update({
      where: { id },
      data
    });
    invalidateStoreCache();
    return this.toCategory(saved);
  }

  async upsertProduct(dto: UpsertProductDto): Promise<StoreProduct> {
    const category = await this.prisma.category.findUnique({
      where: { slug: dto.categorySlug }
    });
    if (!category) {
      throw new NotFoundException("Категория не найдена");
    }

    const productKey = dto.id?.trim() || randomUUID();
    const persistedImage =
      (await persistStoreImage(dto.imageUrl?.trim() || undefined, productKey)) || "/image.png";
    const persistedVariants = dto.variants
      ? await Promise.all(
          dto.variants.map(async (variant, index) => ({
            ...variant,
            imageUrl: (await persistStoreImage(variant.imageUrl, `${productKey}-v${index}`)) ?? variant.imageUrl
          }))
        )
      : dto.variants;

    const payload = {
      name: dto.name.trim(),
      categoryId: category.id,
      color: dto.color?.trim() || null,
      description: dto.description?.trim() || null,
      basePrice: Number(dto.basePrice),
      compareAtPrice: this.resolveProductCompareAtPrice(dto) ?? null,
      memoryPrices: this.normalizePricingPayload(dto.memoryPrices, persistedVariants) as Prisma.InputJsonValue,
      imageUrl: persistedImage
    };

    let saved: Product;
    if (dto.id) {
      saved = await this.prisma.product.update({
        where: { id: dto.id },
        data: payload
      });
    } else {
      saved = await this.prisma.product.create({
        data: { ...payload, id: productKey }
      });
    }

    invalidateStoreCache();
    return this.toProduct({ ...saved, category });
  }

  async removeProduct(id: string): Promise<void> {
    await this.prisma.product.delete({ where: { id } });
    invalidateStoreCache();
  }

  /** Slug'и из ensureSeedData — удаление запрещено, чтобы не сломать витрину. */
  private static readonly protectedCategorySlugs = new Set([
    "iphone",
    "iphone-used",
    "macbook",
    "apple-watch",
    "ipad",
    "airpods",
    "custom"
  ]);

  async removeCategory(id: string): Promise<void> {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) {
      throw new NotFoundException("Категория не найдена");
    }
    if (StoreService.protectedCategorySlugs.has(category.slug)) {
      throw new BadRequestException("Эту категорию нельзя удалить");
    }
    await this.prisma.category.delete({ where: { id } });
    invalidateStoreCache();
  }

  async upsertSliderPhotos(dto: UpsertSliderPhotosDto): Promise<StoreSliderPhoto[]> {
    await this.ensureSliderPhotoTable();

    const photos = (
      await Promise.all(
        dto.photos.map(async (item, index) => ({
          id: item.id?.trim() || undefined,
          title: item.title?.trim() || null,
          imageUrl:
            (await persistStoreImage(item.imageUrl.trim(), `slide-${item.id?.trim() || index}`)) ?? item.imageUrl.trim(),
          position: Number.isFinite(Number(item.position)) ? Number(item.position) : index
        }))
      )
    ).filter((item) => item.imageUrl);

    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`DELETE FROM "SliderPhoto"`;
      for (const [index, photo] of photos.entries()) {
        const id = photo.id ?? randomUUID();
        await tx.$executeRaw`
          INSERT INTO "SliderPhoto" ("id", "title", "imageUrl", "position", "createdAt", "updatedAt")
          VALUES (${id}, ${photo.title}, ${photo.imageUrl}, ${index}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `;
      }
    });

    invalidateStoreCache();
    return this.getSliderPhotos();
  }

  private toCategory(item: { id: string; slug: string; name: string; imageUrl: string | null; memoryOptions: string | null }): StoreCategory {
    return {
      id: item.id,
      slug: item.slug,
      name: item.name,
      imageUrl: item.imageUrl?.trim() || undefined,
      memoryOptions: item.memoryOptions ? item.memoryOptions.split("|").filter(Boolean) : []
    };
  }

  private toProduct(
    item: Product & { category: { slug: string } }
  ): StoreProduct {
    const { memoryPrices, variants } = this.readPricingPayload(item.memoryPrices);
    return {
      id: item.id,
      categorySlug: item.category.slug,
      name: item.name,
      color: item.color ?? undefined,
      description: item.description ?? undefined,
      basePrice: item.basePrice,
      compareAtPrice: this.parseOptionalPrice((item as Product & { compareAtPrice?: number | null }).compareAtPrice) ?? undefined,
      memoryPrices: Object.keys(memoryPrices).length ? memoryPrices : undefined,
      variants: variants.length ? variants : undefined,
      imageUrl: item.imageUrl
    };
  }

  private toBuybackConfig(item: { models: string; memories: string; simTypes: string; conditions: string } | null): BuybackConfigPayload {
    if (!item) {
      return {
        models: ["iPhone 11", "iPhone 12", "iPhone 13", "iPhone 14", "iPhone 15", "iPhone 16"],
        memories: ["64 ГБ", "128 ГБ", "256 ГБ", "512 ГБ", "1 ТБ"],
        simTypes: ["eSIM", "nano-SIM", "eSIM + nano-SIM"],
        conditions: ["Отличное", "Хорошее", "Среднее", "Плохое"]
      };
    }
    return {
      models: this.fromPipeSeparated(item.models),
      memories: this.fromPipeSeparated(item.memories),
      simTypes: this.fromPipeSeparated(item.simTypes),
      conditions: this.fromPipeSeparated(item.conditions)
    };
  }

  private async getBuybackConfigRecordSafe(): Promise<{ models: string; memories: string; simTypes: string; conditions: string } | null> {
    try {
      return await this.prisma.buybackConfig.findUnique({
        where: { id: "main" }
      });
    } catch {
      return null;
    }
  }

  private async getSliderPhotos(): Promise<StoreSliderPhoto[]> {
    await this.ensureSliderPhotoTable();

    const rows = await this.prisma.$queryRaw<Array<{ id: string; title: string | null; imageUrl: string; position: number }>>`
      SELECT "id", "title", "imageUrl", "position"
      FROM "SliderPhoto"
      ORDER BY "position" ASC, "createdAt" ASC
    `;
    return rows.map((item) => this.toSliderPhoto(item));
  }

  private async getSliderPhotosSafe(): Promise<StoreSliderPhoto[]> {
    try {
      return await this.getSliderPhotos();
    } catch {
      return [];
    }
  }

  private async ensureProductCompareAtPriceColumn(): Promise<void> {
    try {
      await this.prisma.$executeRawUnsafe(`ALTER TABLE "Product" ADD COLUMN "compareAtPrice" INTEGER`);
    } catch {
      // Колонка уже есть (после prisma migrate deploy) — существующие товары не трогаем.
    }
  }

  private async ensureSliderPhotoTable(): Promise<void> {
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "SliderPhoto" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "title" TEXT,
        "imageUrl" TEXT NOT NULL,
        "position" INTEGER NOT NULL DEFAULT 0,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL
      )
    `);
  }

  private toSliderPhoto(item: { id: string; title: string | null; imageUrl: string; position: number }): StoreSliderPhoto {
    return {
      id: item.id,
      title: item.title ?? undefined,
      imageUrl: item.imageUrl,
      position: item.position
    };
  }

  private fromPipeSeparated(value: string): string[] {
    return value
      .split("|")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  private normalizeOptionList(input: string[]): string[] {
    return Array.from(
      new Set(
        input
          .map((item) => item.trim())
          .filter(Boolean)
      )
    );
  }

  private normalizeMemoryPrices(input?: Record<string, number>): Record<string, number> {
    const map: Record<string, number> = {};
    if (!input) return map;
    for (const [key, value] of Object.entries(input)) {
      const parsed = Number(value);
      if (key && Number.isFinite(parsed)) {
        map[key] = parsed;
      }
    }
    return map;
  }

  private parseOptionalPrice(value: unknown): number | undefined {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return undefined;
    return Math.round(n);
  }

  private resolveProductCompareAtPrice(dto: UpsertProductDto): number | undefined {
    const fromDto = this.parseOptionalPrice(dto.compareAtPrice);
    if (fromDto) return fromDto;
    const variants = this.normalizeVariants(dto.variants);
    if (!variants.length) return undefined;
    const cheapest = variants.reduce((acc, item) => (item.price <= acc.price ? item : acc));
    return this.parseOptionalPrice(cheapest.compareAtPrice) ?? variants.find((item) => item.compareAtPrice)?.compareAtPrice;
  }

  private normalizeVariants(
    input?: Array<{
      color?: string;
      memory?: string;
      simType?: string;
      screen?: string;
      ram?: string;
      price: number;
      compareAtPrice?: number;
      imageUrl?: string;
      availability?: string;
    }>
  ) {
    const normalized: Array<{
      color?: string;
      memory?: string;
      simType?: string;
      screen?: string;
      ram?: string;
      price: number;
      compareAtPrice?: number;
      imageUrl?: string;
      availability?: string;
    }> = [];
    if (!input?.length) return normalized;
    for (const item of input) {
      const price = Number(item.price);
      if (!Number.isFinite(price)) continue;
      const av = item.availability?.trim().toLowerCase();
      const compareAtPrice = this.parseOptionalPrice(item.compareAtPrice);
      normalized.push({
        color: item.color?.trim() || undefined,
        memory: item.memory?.trim() || undefined,
        simType: item.simType?.trim() || undefined,
        screen: item.screen?.trim() || undefined,
        ram: item.ram?.trim() || undefined,
        price,
        ...(compareAtPrice ? { compareAtPrice } : {}),
        imageUrl: item.imageUrl?.trim() || undefined,
        availability:
          av && ["in_stock", "coming_soon", "out_of_stock", "unknown"].includes(av) ? av : undefined
      });
    }
    return normalized;
  }

  private normalizePricingPayload(
    memoryPrices?: Record<string, number>,
    variants?: Array<{
      color?: string;
      memory?: string;
      simType?: string;
      screen?: string;
      ram?: string;
      price: number;
      compareAtPrice?: number;
      imageUrl?: string;
      availability?: string;
    }>
  ): Prisma.JsonValue | null {
    const normalizedVariants = this.normalizeVariants(variants);
    if (normalizedVariants.length) {
      return { variants: normalizedVariants };
    }
    const normalizedMemoryPrices = this.normalizeMemoryPrices(memoryPrices);
    return Object.keys(normalizedMemoryPrices).length ? normalizedMemoryPrices : null;
  }

  private readPricingPayload(input: Prisma.JsonValue | null): {
    memoryPrices: Record<string, number>;
    variants: Array<{
      color?: string;
      memory?: string;
      simType?: string;
      screen?: string;
      ram?: string;
      price: number;
      compareAtPrice?: number;
      imageUrl?: string;
      availability?: string;
    }>;
  } {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      return { memoryPrices: {}, variants: [] };
    }

    const rawObject = input as Record<string, unknown>;
    const memoryPrices: Record<string, number> = {};
    for (const [key, value] of Object.entries(rawObject)) {
      if (key === "variants") continue;
      const parsed = Number(value);
      if (key && Number.isFinite(parsed)) {
        memoryPrices[key] = parsed;
      }
    }

    const variants: Array<{
      color?: string;
      memory?: string;
      simType?: string;
      screen?: string;
      ram?: string;
      price: number;
      compareAtPrice?: number;
      imageUrl?: string;
      availability?: string;
    }> = [];
    if (Array.isArray(rawObject.variants)) {
      for (const item of rawObject.variants) {
        if (!item || typeof item !== "object") continue;
        const candidate = item as Record<string, unknown>;
        const parsedPrice = Number(candidate.price);
        if (!Number.isFinite(parsedPrice)) continue;
        const avRaw = candidate.availability;
        const av =
          typeof avRaw === "string" ? avRaw.trim().toLowerCase() : undefined;
        const compareAtPrice = this.parseOptionalPrice(candidate.compareAtPrice);
        variants.push({
          color: typeof candidate.color === "string" ? candidate.color.trim() || undefined : undefined,
          memory: typeof candidate.memory === "string" ? candidate.memory.trim() || undefined : undefined,
          simType: typeof candidate.simType === "string" ? candidate.simType.trim() || undefined : undefined,
          screen: typeof candidate.screen === "string" ? candidate.screen.trim() || undefined : undefined,
          ram: typeof candidate.ram === "string" ? candidate.ram.trim() || undefined : undefined,
          price: parsedPrice,
          ...(compareAtPrice ? { compareAtPrice } : {}),
          imageUrl: typeof candidate.imageUrl === "string" ? candidate.imageUrl.trim() || undefined : undefined,
          availability:
            av && ["in_stock", "coming_soon", "out_of_stock", "unknown"].includes(av) ? av : undefined
        });
      }
    }

    return { memoryPrices, variants };
  }

  private createSlug(value: string): string {
    return value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9а-яё]+/gi, "-")
      .replace(/^-+|-+$/g, "");
  }

  private sortCategoriesForStore<T extends { slug: string }>(items: T[]): T[] {
    const order = [
      "iphone",
      "iphone-used",
      "macbook",
      "apple-watch",
      "ipad",
      "airpods",
      "dyson",
      "consoles",
      "custom"
    ];
    const rank = (slug: string) => {
      const idx = order.indexOf(slug);
      return idx === -1 ? 800 : idx;
    };
    return [...items].sort((a, b) => {
      const d = rank(a.slug) - rank(b.slug);
      return d !== 0 ? d : a.slug.localeCompare(b.slug);
    });
  }
}
