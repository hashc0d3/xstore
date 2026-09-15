"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BrandMark } from "@/components/brand-mark";
import { CategoryStripSkeleton, ProductGridSkeleton } from "@/components/catalog-skeleton";
import { ProductPrice } from "@/components/product-price";
import { createLead, fetchStoreData } from "@/lib/api";
import {
  CART_STORAGE_KEY,
  IS_SOTIK_BRAND,
  SLIDER_PHOTO_ALT_FALLBACK,
  SOTIK_AVITO_REVIEWS_HREF,
  SOTIK_BUYBACK_NOTE,
  SOTIK_HEADER_ADDRESS,
  SOTIK_HOURS_DETAIL,
  SOTIK_OPEN_HOURS_BADGE,
  SOTIK_PHONE_DISPLAY,
  SOTIK_PHONE_HREF,
  SOTIK_TELEGRAM_HREF,
  VK_HREF
} from "@/lib/brand";
import { Category, Product, ProductVariant, StoreData, defaultStoreData, resolveCompareAtPrice } from "@/lib/store";

const IPHONE_LIKE_SLUGS = new Set(["iphone", "iphone-used"]);
const MACBOOK_LIKE_SLUGS = new Set(["macbook"]);
const IPAD_LIKE_SLUGS = new Set(["ipad"]);
const WATCH_LIKE_SLUGS = new Set(["apple-watch"]);
const CATALOG_PAGE_SIZE = 8;

function normalizeCategorySlug(slug: string | undefined): string | undefined {
  if (!slug) return undefined;
  const t = slug.trim().toLowerCase();
  return t || undefined;
}

function isIphoneLikeSlug(slug: string | undefined): boolean {
  const s = normalizeCategorySlug(slug);
  return Boolean(s && IPHONE_LIKE_SLUGS.has(s));
}

function isMacbookLikeSlug(slug: string | undefined): boolean {
  const s = normalizeCategorySlug(slug);
  return Boolean(s && MACBOOK_LIKE_SLUGS.has(s));
}

function isIpadLikeSlug(slug: string | undefined): boolean {
  const s = normalizeCategorySlug(slug);
  return Boolean(s && IPAD_LIKE_SLUGS.has(s));
}

function isWatchLikeSlug(slug: string | undefined): boolean {
  const s = normalizeCategorySlug(slug);
  return Boolean(s && WATCH_LIKE_SLUGS.has(s));
}

function memoryPriceEntries(product: Product): Array<[string, number]> {
  const mp = product.memoryPrices;
  if (!mp || typeof mp !== "object") return [];
  const entries = Object.entries(mp).filter(([k, v]) => {
    const n = Number(v);
    return Boolean(k?.trim()) && Number.isFinite(n);
  }) as Array<[string, number]>;
  entries.sort((a, b) => Number(a[1]) - Number(b[1]));
  return entries;
}

/**
 * Старый формат БД: пустой variants → только memoryPrices.
 * Частый прод-кейс: variants есть, но в каждой строке только color/price — без memory/screen;
 * тогда без раскладки по memoryPrices селекторы «Накопитель» и т.д. не появляются.
 */
function effectiveVariantsForProduct(product: Product, categorySlug: string | undefined): ProductVariant[] {
  const raw = product.variants ?? [];
  const slug = normalizeCategorySlug(categorySlug);
  const usesMemoryAxis =
    Boolean(slug) &&
    (isIphoneLikeSlug(slug) || isMacbookLikeSlug(slug) || isIpadLikeSlug(slug));

  const entries = memoryPriceEntries(product);

  if (!raw.length) {
    if (!usesMemoryAxis || !entries.length) return [];
    const color = product.color?.trim();
    const imageUrl = product.imageUrl;
    return entries.map(([memory, price]) => ({
      ...(color ? { color } : {}),
      memory,
      price: Number(price),
      imageUrl
    }));
  }

  if (usesMemoryAxis && entries.length > 0) {
    const allLackMemory = raw.every((v) => !String(v.memory ?? "").trim());
    if (allLackMemory) {
      const expanded: ProductVariant[] = [];
      for (const row of raw) {
        for (const [memory, price] of entries) {
          expanded.push({
            ...row,
            memory,
            price: Number(price)
          });
        }
      }
      return expanded;
    }
  }

  return raw;
}

function availabilityBadgeText(availability?: string, price?: number): string | null {
  const a = (availability || "").toLowerCase();
  if (a === "coming_soon") return "Скоро в продаже";
  if (a === "out_of_stock") return "Нет в наличии";
  // Цена 0 без явной метки в админке — не показываем «0 ₽», а «Скоро в продаже».
  if (price !== undefined && price <= 0 && (a === "unknown" || !a || a === "in_stock")) {
    return "Скоро в продаже";
  }
  return null;
}

function variantCanAddToCart(variant: { availability?: string; price: number } | null | undefined): boolean {
  if (!variant) return false;
  if (variant.price <= 0) return false;
  const a = (variant.availability || "").toLowerCase();
  if (a === "coming_soon" || a === "out_of_stock") return false;
  return true;
}

type ModalType = "tradein" | "reviews" | "order" | "product" | "preorder" | null;
type VariantSelection = {
  color?: string;
  memory?: string;
  simType?: string;
  screen?: string;
  ram?: string;
};
type CartItem = {
  key: string;
  productId: string;
  name: string;
  color?: string;
  memory?: string;
  simType?: string;
  screen?: string;
  ram?: string;
  price: number;
  imageUrl: string;
  quantity: number;
};

function persistCartItems(items: CartItem[]) {
  window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
}

const quickLinks = [
  "Каталог",
  "Trade-in",
  "Выкуп",
  "Отзывы",
  "Статьи",
  "Доставка и оплата",
  "Возврат и обмен",
  "Гарантия и проверка"
];

function Modal({
  title,
  subtitle,
  children,
  iconSrc,
  iconAlt,
  hideBadge,
  noScroll,
  onClose
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  iconSrc?: string;
  iconAlt?: string;
  hideBadge?: boolean;
  noScroll?: boolean;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-3 min-[640px]:p-4" onClick={onClose}>
      <div
        className={`relative w-full rounded-3xl bg-white shadow-2xl ${
          noScroll ? "max-h-[96vh] overflow-visible p-4 min-[640px]:p-5" : "max-h-[92vh] overflow-y-auto p-5 min-[640px]:p-6"
        } ${noScroll ? "max-w-3xl" : "max-w-md"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 text-xl text-zinc-400 transition hover:text-zinc-700"
        >
          ×
        </button>
        {hideBadge
          ? null
          : iconSrc ? (
              <span className="mb-4 inline-flex h-8 w-8 items-center justify-center rounded-full bg-red-50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={iconSrc} alt={iconAlt ?? ""} className="h-4 w-4" />
              </span>
            ) : (
              <div className="mb-4 h-8 w-8 rounded-full bg-zinc-100" />
            )}
        <h3 className={`${noScroll ? "mb-1 text-xl min-[640px]:text-2xl" : "mb-2 text-lg min-[640px]:text-2xl"} font-semibold text-zinc-900`}>{title}</h3>
        <p className={`${noScroll ? "mb-3 text-xs leading-5 min-[640px]:text-sm" : "mb-5 text-sm leading-6"} text-zinc-500`}>{subtitle}</p>
        {children}
      </div>
    </div>
  );
}

function CategoryCard({ category, onPodZakaz }: { category: Category; onPodZakaz?: () => void }) {
  const isDark = category.slug === "custom";
  const imageCandidatesBySlug: Record<string, string[]> = {
    iphone: ["/iphone.png", "/iphone.jpg", "/iphone.webp", "/image.png"],
    "iphone-used": ["/iphone.png", "/iphone.jpg", "/iphone.webp", "/image.png"],
    macbook: ["/macbook.png", "/macbook.jpg", "/macbook.webp"],
    "apple-watch": ["/applewatch.png", "/watch.png", "/watch.jpg", "/watch.webp"],
    ipad: ["/ipad.png", "/ipad.jpg", "/ipad.webp"],
    airpods: ["/airpods.png", "/airpods.jpg", "/airpods.webp"],
    dyson: ["/image.png"],
    consoles: ["/image.png"],
    custom: ["/zakaz.png", "/custom.png", "/custom.jpg", "/custom.webp"]
  };
  const slugFallback = imageCandidatesBySlug[category.slug] ?? [];
  const customCover = category.imageUrl?.trim();
  const candidates = customCover
    ? [customCover, ...slugFallback, "/image.png"]
    : slugFallback.length > 0
      ? [...slugFallback, "/image.png"]
      : ["/image.png"];
  const [imageIdx, setImageIdx] = useState(0);
  const imageSrc = candidates[imageIdx];
  const imagePlacementBySlug: Record<string, string> = {
    iphone: "right-[-8%] top-1/2 h-[96%] -translate-y-1/2",
    "iphone-used": "right-[-8%] top-1/2 h-[96%] -translate-y-1/2",
    macbook: "right-[-6%] top-1/2 h-[90%] -translate-y-1/2",
    "apple-watch": "right-[-4%] top-1/2 h-[86%] -translate-y-1/2",
    ipad: "right-[-4%] top-1/2 h-[96%] -translate-y-1/2",
    airpods: "right-[-4%] top-1/2 h-[86%] -translate-y-1/2",
    dyson: "right-[-4%] top-1/2 h-[88%] -translate-y-1/2",
    consoles: "right-[-4%] top-1/2 h-[88%] -translate-y-1/2",
    custom: "right-[-4%] top-1/2 h-[94%] -translate-y-1/2"
  };
  const imagePlacement = imagePlacementBySlug[category.slug] ?? "right-[-4%] top-1/2 h-[90%] -translate-y-1/2";

  const cardClass = `group relative h-[74px] w-[9rem] shrink-0 snap-start overflow-hidden rounded-xl border border-zinc-200 p-1.5 shadow-sm transition duration-200 will-change-transform hover:-translate-y-1 hover:border-zinc-300 hover:shadow-md min-[480px]:h-[88px] min-[480px]:w-[10.25rem] min-[640px]:h-[108px] min-[640px]:w-[11.75rem] min-[960px]:h-[132px] min-[960px]:w-[13.25rem] min-[960px]:rounded-2xl min-[960px]:p-3 ${
    isDark ? "bg-zinc-900 hover:border-zinc-600 hover:shadow-[0_14px_32px_-6px_rgba(0,0,0,0.5)]" : "bg-[#f6f6f7]"
  }`;

  const inner = (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/icon/catalog.svg"
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute left-1.5 top-1.5 h-2.5 w-2.5 min-[640px]:h-3 min-[640px]:w-3 min-[960px]:left-3 min-[960px]:top-3 min-[960px]:h-3.5 min-[960px]:w-3.5"
      />
      {imageSrc ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageSrc}
            alt={category.name}
            loading="lazy"
            decoding="async"
            className={`pointer-events-none absolute w-auto object-contain min-[640px]:h-[98%] ${imagePlacement} ${
              isDark ? "opacity-95" : "opacity-100"
            }`}
            onError={() => setImageIdx((idx) => (idx + 1 < candidates.length ? idx + 1 : idx))}
          />
          {!isDark ? <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent to-black/[0.02]" /> : null}
        </>
      ) : null}
      <h3
        className={`absolute bottom-1.5 left-1.5 max-w-[82%] text-[11px] font-bold leading-none min-[480px]:text-xs min-[640px]:text-sm min-[900px]:text-base min-[960px]:bottom-3 min-[960px]:left-3 min-[1440px]:text-xl ${
          isDark ? "text-white" : "text-zinc-800"
        }`}
      >
        {category.name}
      </h3>
    </>
  );

  if (category.slug === "custom" && onPodZakaz) {
    return (
      <button type="button" onClick={onPodZakaz} className={`${cardClass} block cursor-pointer text-left`}>
        {inner}
      </button>
    );
  }

  return (
    <Link href={`/catalog/${category.slug}`} className={cardClass}>
      {inner}
    </Link>
  );
}

function ProductCard({
  product,
  category,
  eager,
  onOrder,
  onAddToCart,
  onOpenDetails
}: {
  product: Product;
  category?: Category;
  eager?: boolean;
  onOrder: (selection: VariantSelection) => void;
  onAddToCart: (
    selection: VariantSelection & { price: number; imageUrl: string }
  ) => void;
  onOpenDetails: (selection: VariantSelection) => void;
}) {
  const categorySlug = category?.slug ?? product.categorySlug;
  const isIphoneCategory = isIphoneLikeSlug(categorySlug);
  const isMacbookCategory = isMacbookLikeSlug(categorySlug);
  const isIpadCategory = isIpadLikeSlug(categorySlug);
  const isWatchCategory = isWatchLikeSlug(categorySlug);
  const usesMemory = isIphoneCategory || isMacbookCategory || isIpadCategory;
  const usesScreen = isMacbookCategory || isIpadCategory || isWatchCategory;
  const usesRam = isMacbookCategory;
  const showSimSelector = isIphoneCategory || isIpadCategory || isWatchCategory;
  const simLabel = isIphoneCategory ? "SIM" : isIpadCategory ? "Связь" : isWatchCategory ? "Ремешок" : "SIM";
  const variants = useMemo(() => effectiveVariantsForProduct(product, categorySlug), [product, categorySlug]);
  const hasVariants = variants.length > 0;
  const colorOptions = useMemo(
    () =>
      hasVariants
        ? Array.from(new Set(variants.map((item) => item.color).filter((item): item is string => Boolean(item))))
        : product.color
          ? [product.color]
          : [],
    [hasVariants, product.color, variants]
  );
  const [selectedColor, setSelectedColor] = useState<string>(() => {
    if (colorOptions.length === 0) return "";
    if (product.color && colorOptions.includes(product.color)) return product.color;
    return colorOptions[0] ?? "";
  });
  const colorScopedVariants = hasVariants
    ? variants.filter((item) => !selectedColor || item.color === selectedColor)
    : [];
  const allMemoryOptions = hasVariants && usesMemory
    ? Array.from(new Set(colorScopedVariants.map((item) => item.memory).filter((item): item is string => Boolean(item))))
    : [];
  const allSimOptions = hasVariants && showSimSelector
    ? Array.from(new Set(colorScopedVariants.map((item) => item.simType).filter((item): item is string => Boolean(item))))
    : [];
  const allScreenOptions = hasVariants && usesScreen
    ? Array.from(new Set(colorScopedVariants.map((item) => item.screen).filter((item): item is string => Boolean(item))))
    : [];
  const allRamOptions = hasVariants && usesRam
    ? Array.from(new Set(colorScopedVariants.map((item) => item.ram).filter((item): item is string => Boolean(item))))
    : [];
  const [selectedMemory, setSelectedMemory] = useState<string>(() => {
    if (hasVariants && usesMemory) return allMemoryOptions[0] ?? "";
    return "";
  });
  const [selectedSim, setSelectedSim] = useState<string>(() => allSimOptions[0] ?? "");
  const [selectedScreen, setSelectedScreen] = useState<string>(() => allScreenOptions[0] ?? "");
  const [selectedRam, setSelectedRam] = useState<string>(() => allRamOptions[0] ?? "");
  const matches = (
    item: typeof variants[number],
    excludeKey: keyof VariantSelection
  ) =>
    (!selectedColor || item.color === selectedColor) &&
    (excludeKey === "memory" || !usesMemory || !selectedMemory || item.memory === selectedMemory) &&
    (excludeKey === "simType" || !showSimSelector || !selectedSim || item.simType === selectedSim) &&
    (excludeKey === "screen" || !usesScreen || !selectedScreen || item.screen === selectedScreen) &&
    (excludeKey === "ram" || !usesRam || !selectedRam || item.ram === selectedRam);

  const memoryOptions = hasVariants && usesMemory
    ? Array.from(new Set(variants.filter((item) => matches(item, "memory")).map((item) => item.memory).filter((item): item is string => Boolean(item))))
    : [];
  const simOptions = hasVariants && showSimSelector
    ? Array.from(new Set(variants.filter((item) => matches(item, "simType")).map((item) => item.simType).filter((item): item is string => Boolean(item))))
    : [];
  const screenOptions = hasVariants && usesScreen
    ? Array.from(new Set(variants.filter((item) => matches(item, "screen")).map((item) => item.screen).filter((item): item is string => Boolean(item))))
    : [];
  const ramOptions = hasVariants && usesRam
    ? Array.from(new Set(variants.filter((item) => matches(item, "ram")).map((item) => item.ram).filter((item): item is string => Boolean(item))))
    : [];

  const activeVariant = useMemo(() => {
    if (!hasVariants) return null;
    if (!isIphoneCategory && !isMacbookCategory && !isIpadCategory && !isWatchCategory) {
      return (
        variants.find((item) => (!selectedColor || item.color === selectedColor)) ??
        variants[0]
      );
    }
    const matchesAll = (item: typeof variants[number]) =>
      (!selectedColor || item.color === selectedColor) &&
      (!usesMemory || !selectedMemory || item.memory === selectedMemory) &&
      (!showSimSelector || !selectedSim || item.simType === selectedSim) &&
      (!usesScreen || !selectedScreen || item.screen === selectedScreen) &&
      (!usesRam || !selectedRam || item.ram === selectedRam);
    return (
      variants.find(matchesAll) ??
      variants.find((item) => !selectedColor || item.color === selectedColor) ??
      variants[0]
    );
  }, [
    hasVariants,
    isIphoneCategory,
    isMacbookCategory,
    isIpadCategory,
    isWatchCategory,
    selectedColor,
    selectedMemory,
    selectedRam,
    selectedScreen,
    selectedSim,
    showSimSelector,
    usesMemory,
    usesRam,
    usesScreen,
    variants
  ]);

  const shownPrice = activeVariant?.price ?? product.basePrice;
  const shownCompareAt = resolveCompareAtPrice(shownPrice, activeVariant, product);
  const stockBadge = availabilityBadgeText(
    activeVariant?.availability,
    activeVariant ? activeVariant.price : product.basePrice
  );
  const canCart = variantCanAddToCart(
    activeVariant ?? { price: product.basePrice, availability: undefined }
  );
  const currentImage = activeVariant?.imageUrl ?? product.imageUrl;

  const colorLabel = product.color ?? "";
  const normalizedColor = (selectedColor || colorLabel).toLowerCase();
  const colorDotClass = normalizedColor.includes("orange")
    ? "bg-orange-400"
    : normalizedColor.includes("silver") || normalizedColor.includes("white")
      ? "bg-zinc-400"
      : normalizedColor.includes("blue")
        ? "bg-slate-600"
        : normalizedColor.includes("purple")
          ? "bg-violet-500"
          : normalizedColor.includes("black") || normalizedColor.includes("midnight")
            ? "bg-zinc-800"
            : normalizedColor.includes("gold") || normalizedColor.includes("starlight")
              ? "bg-amber-400"
              : "bg-zinc-500";
  return (
    <article
      className="flex h-full w-full cursor-pointer flex-col rounded-xl border border-zinc-200 bg-[#f9f9fa] p-1.5 shadow-[0_4px_12px_rgba(24,24,27,0.06)] transition hover:-translate-y-0.5 hover:shadow-[0_8px_18px_rgba(24,24,27,0.1)] min-[640px]:max-w-[260px] min-[640px]:justify-self-start min-[640px]:rounded-2xl min-[640px]:p-2 min-[960px]:max-w-none min-[960px]:justify-self-stretch"
      onClick={() =>
        onOpenDetails({
          color: selectedColor || undefined,
          memory: selectedMemory || undefined,
          simType: selectedSim || undefined,
          screen: selectedScreen || undefined,
          ram: selectedRam || undefined
        })
      }
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpenDetails({
            color: selectedColor || undefined,
            memory: selectedMemory || undefined,
            simType: selectedSim || undefined,
            screen: selectedScreen || undefined,
            ram: selectedRam || undefined
          });
        }
      }}
      tabIndex={0}
      role="button"
      aria-label={`Открыть описание товара ${product.name}`}
    >
      <div className="overflow-hidden rounded-xl bg-white min-[640px]:rounded-2xl">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={currentImage || "/image.png"}
          alt={product.name}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          fetchPriority={eager ? "high" : "low"}
          className="h-[7.5rem] w-full object-contain p-1 transition-opacity duration-300 min-[640px]:h-[8.5rem]"
        />
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-2 min-[640px]:p-2.5">
        <h4 className="mt-1 line-clamp-1 text-base font-bold leading-tight text-zinc-900 min-[480px]:text-lg min-[960px]:text-xl">
          {product.name}
        </h4>
        {colorOptions.length > 0 ? (
          <div className="space-y-1">
            <p className="text-xs text-zinc-500">Цвет</p>
            <div className="flex flex-wrap gap-1">
              {colorOptions.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold transition min-[640px]:px-2 min-[640px]:text-[11px] ${
                    selectedColor === color ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedColor(color);
                    if (hasVariants && (isIphoneCategory || isMacbookCategory || isIpadCategory || isWatchCategory)) {
                      const scoped = variants.filter((item) => item.color === color);
                      const fallback =
                        scoped.find(
                          (item) =>
                            (!usesMemory || !selectedMemory || item.memory === selectedMemory) &&
                            (!showSimSelector || !selectedSim || item.simType === selectedSim) &&
                            (!usesScreen || !selectedScreen || item.screen === selectedScreen) &&
                            (!usesRam || !selectedRam || item.ram === selectedRam)
                        ) ??
                        scoped.find((item) => !usesMemory || !selectedMemory || item.memory === selectedMemory) ??
                        scoped[0];
                      if (usesMemory) setSelectedMemory(fallback?.memory ?? "");
                      if (showSimSelector) setSelectedSim(fallback?.simType ?? "");
                      if (usesScreen) setSelectedScreen(fallback?.screen ?? "");
                      if (usesRam) setSelectedRam(fallback?.ram ?? "");
                    }
                  }}
                >
                  {color}
                </button>
              ))}
            </div>
            {!hasVariants ? (
              <p className="flex items-center justify-between text-xs text-zinc-600 min-[640px]:text-sm">
                <span>{selectedColor || product.color}</span>
                <span className={`inline-block h-2 w-2 rounded-full ${colorDotClass}`} />
              </p>
            ) : null}
          </div>
        ) : null}
        {screenOptions.length > 0 ? (
          <div className="space-y-1">
            <p className="text-xs text-zinc-500">{isWatchCategory ? "Размер корпуса" : "Диагональ"}</p>
            <div className="flex flex-wrap gap-1">
              {screenOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold transition min-[640px]:px-2 min-[640px]:text-[11px] ${
                    selectedScreen === option ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedScreen(option);
                    const scoped = colorScopedVariants.filter((item) => item.screen === option);
                    const fallback =
                      scoped.find(
                        (item) =>
                          (!usesMemory || !selectedMemory || item.memory === selectedMemory) &&
                          (!usesRam || !selectedRam || item.ram === selectedRam) &&
                          (!showSimSelector || !selectedSim || item.simType === selectedSim)
                      ) ?? scoped[0];
                    if (fallback) {
                      if (usesMemory) setSelectedMemory(fallback.memory ?? "");
                      if (usesRam) setSelectedRam(fallback.ram ?? "");
                      if (showSimSelector) setSelectedSim(fallback.simType ?? "");
                    }
                  }}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {memoryOptions.length > 0 ? (
          <div className="space-y-1">
            <p className="text-xs text-zinc-500">{isMacbookCategory || isIpadCategory ? "Накопитель" : "Объем"}</p>
            <div className="flex flex-wrap gap-1">
              {memoryOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold transition min-[640px]:px-2 min-[640px]:text-[11px] ${
                    selectedMemory === option
                      ? "bg-zinc-900 text-white"
                      : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedMemory(option);
                    const scoped = colorScopedVariants.filter((item) => item.memory === option);
                    const fallback =
                      scoped.find(
                        (item) =>
                          (!selectedSim || item.simType === selectedSim) &&
                          (!selectedScreen || item.screen === selectedScreen) &&
                          (!selectedRam || item.ram === selectedRam)
                      ) ?? scoped[0];
                    if (fallback) {
                      if (showSimSelector) setSelectedSim(fallback.simType ?? "");
                      if (usesScreen) setSelectedScreen(fallback.screen ?? "");
                      if (usesRam) setSelectedRam(fallback.ram ?? "");
                    }
                  }}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {ramOptions.length > 0 ? (
          <div className="space-y-1">
            <p className="text-xs text-zinc-500">Оперативная память</p>
            <div className="flex flex-wrap gap-1">
              {ramOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold transition min-[640px]:px-2 min-[640px]:text-[11px] ${
                    selectedRam === option ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedRam(option);
                    const scoped = colorScopedVariants.filter((item) => item.ram === option);
                    const fallback =
                      scoped.find(
                        (item) =>
                          (!selectedMemory || item.memory === selectedMemory) &&
                          (!selectedScreen || item.screen === selectedScreen)
                      ) ?? scoped[0];
                    if (fallback) {
                      setSelectedMemory(fallback.memory ?? "");
                      setSelectedScreen(fallback.screen ?? "");
                    }
                  }}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {simOptions.length > 0 ? (
          <div className="space-y-1">
            <p className="text-xs text-zinc-500">{simLabel}</p>
            <div className="flex flex-wrap gap-1">
              {simOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold transition min-[640px]:px-2 min-[640px]:text-[11px] ${
                    selectedSim === option ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedSim(option);
                    const fallback =
                      colorScopedVariants.find(
                        (item) =>
                          item.simType === option &&
                          (!usesMemory || !selectedMemory || item.memory === selectedMemory) &&
                          (!usesScreen || !selectedScreen || item.screen === selectedScreen)
                      ) ?? colorScopedVariants.find((item) => item.simType === option);
                    if (fallback) {
                      if (usesMemory) setSelectedMemory(fallback.memory ?? "");
                      if (usesScreen) setSelectedScreen(fallback.screen ?? "");
                    }
                  }}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <div className="mt-auto space-y-2">
          {stockBadge ? (
            <p className="text-[11px] font-semibold text-amber-800 min-[640px]:text-xs">{stockBadge}</p>
          ) : null}
          <ProductPrice
            price={shownPrice}
            compareAtPrice={shownCompareAt}
            unavailableText={stockBadge === "Скоро в продаже" ? "Скоро в продаже" : "Цена по запросу"}
            size="card"
          />
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOrder({
                color: selectedColor || undefined,
                memory: selectedMemory || undefined,
                simType: selectedSim || undefined,
                screen: selectedScreen || undefined,
                ram: selectedRam || undefined
              });
            }}
            className="w-full rounded-lg border border-red-100 bg-[#fdecec] py-1.5 text-xs font-semibold text-red-500 transition-all duration-200 hover:-translate-y-0.5 hover:border-zinc-900 hover:bg-zinc-900 hover:text-white hover:shadow-[0_10px_24px_rgba(24,24,27,0.25)] min-[640px]:text-sm"
          >
            Заказать
          </button>
          <button
            type="button"
            disabled={!canCart}
            title={!canCart ? "Недоступно для корзины" : undefined}
            onClick={(e) => {
              e.stopPropagation();
              if (!canCart) return;
              onAddToCart({
                color: selectedColor || undefined,
                memory: selectedMemory || undefined,
                simType: selectedSim || undefined,
                screen: selectedScreen || undefined,
                ram: selectedRam || undefined,
                price: shownPrice,
                imageUrl: currentImage
              });
            }}
            className="w-full rounded-lg border border-zinc-200 bg-white py-1.5 text-xs font-semibold text-zinc-800 transition hover:border-zinc-300 hover:bg-zinc-50 min-[640px]:text-sm disabled:cursor-not-allowed disabled:opacity-45"
          >
            В корзину
          </button>
        </div>
      </div>
    </article>
  );
}

export type StorefrontProps = {
  /** SSR: данные с API сразу, без пустой витрины и лишнего ожидания. */
  initialStoreData?: StoreData;
};

export default function Storefront({ initialStoreData }: StorefrontProps) {
  const pathname = usePathname();
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [footerMenuOpen, setFooterMenuOpen] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [isHeaderFloating, setIsHeaderFloating] = useState(false);
  const [isDesktopHeader, setIsDesktopHeader] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedProductMemory, setSelectedProductMemory] = useState("");
  const [selectedProductColor, setSelectedProductColor] = useState("");
  const [selectedProductSim, setSelectedProductSim] = useState("");
  const [selectedProductScreen, setSelectedProductScreen] = useState("");
  const [selectedProductRam, setSelectedProductRam] = useState("");
  const [reviewSlideIndex, setReviewSlideIndex] = useState(0);
  const [orderSelection, setOrderSelection] = useState<{
    productName?: string;
    color?: string;
    memory?: string;
    simType?: string;
    screen?: string;
    ram?: string;
  } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [catalogVisibleCount, setCatalogVisibleCount] = useState(CATALOG_PAGE_SIZE);
  const [storeData, setStoreData] = useState<StoreData>(() => initialStoreData ?? defaultStoreData);
  const [storeFetched, setStoreFetched] = useState(() => Boolean(initialStoreData));
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [cartHydrated, setCartHydrated] = useState(false);
  const [sendingLead, setSendingLead] = useState(false);
  const [leadNotice, setLeadNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const categoryStripRef = useRef<HTMLDivElement>(null);
  const [categoryStripOverflow, setCategoryStripOverflow] = useState(false);
  const [categoryStripEdges, setCategoryStripEdges] = useState({ canLeft: false, canRight: false });

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CART_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as CartItem[];
      if (Array.isArray(parsed)) {
        setCartItems(parsed);
      }
    } catch {
      setCartItems([]);
    } finally {
      setCartHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!cartHydrated) return;
    persistCartItems(cartItems);
  }, [cartHydrated, cartItems]);

  useEffect(() => {
    const hasServerCatalog = Boolean(initialStoreData?.categories.some((item) => item.id.length > 8));
    if (hasServerCatalog) {
      setStoreFetched(true);
      return;
    }
    void fetchStoreData().then((remote) => {
      setStoreData(remote);
      setStoreFetched(true);
    });
  }, [initialStoreData]);

  const reviewPhotos = useMemo(() => {
    return (storeData.sliderPhotos ?? []).filter((photo) => photo.imageUrl);
  }, [storeData.sliderPhotos]);

  useEffect(() => {
    if (!reviewPhotos.length) {
      setReviewSlideIndex(0);
      return;
    }
    setReviewSlideIndex((index) => Math.min(index, reviewPhotos.length - 1));
  }, [reviewPhotos.length]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [mobileMenuOpen]);

  useEffect(() => {
    const onScroll = () => {
      setIsHeaderFloating(window.scrollY > 10);
      setShowScrollTop(window.scrollY > 240);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 960px)");
    const update = () => setIsDesktopHeader(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!leadNotice) return;
    const timer = window.setTimeout(() => setLeadNotice(null), 3500);
    return () => window.clearTimeout(timer);
  }, [leadNotice]);

  const headerFloat = isHeaderFloating && isDesktopHeader && !IS_SOTIK_BRAND;

  const routeCategorySlug = useMemo(() => {
    const parts = pathname.split("/").filter(Boolean);
    if (parts[0] === "catalog" && parts[1]) {
      return parts[1];
    }
    return null;
  }, [pathname]);
  const isHomePage = pathname === "/";
  const isPolicyPage = pathname === "/policy";
  const isOfferPage = pathname === "/offer";
  const isInfoPage = pathname === "/info";
  const isStaticPage = isPolicyPage || isOfferPage || isInfoPage;

  const activeCategory = useMemo(() => {
    if (!routeCategorySlug) {
      return null;
    }
    return storeData.categories.find((item) => item.slug === routeCategorySlug) ?? null;
  }, [routeCategorySlug, storeData.categories]);

  const visibleProducts = useMemo(() => {
    if (!activeCategory) {
      return storeData.products;
    }
    return storeData.products.filter((product) => product.categorySlug === activeCategory.slug);
  }, [activeCategory, storeData.products]);

  const categoriesBySlug = useMemo(() => {
    const map: Record<string, Category> = {};
    for (const category of storeData.categories) {
      map[category.slug] = category;
    }
    return map;
  }, [storeData.categories]);

  const displayCategories = useMemo(() => {
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
    return [...storeData.categories].sort((a, b) => {
      const d = rank(a.slug) - rank(b.slug);
      return d !== 0 ? d : a.slug.localeCompare(b.slug);
    });
  }, [storeData.categories]);

  const updateCategoryStripEdges = useCallback(() => {
    const el = categoryStripRef.current;
    if (!el) return;
    const { scrollWidth, clientWidth } = el;
    const max = Math.max(0, scrollWidth - clientWidth);
    if (max <= 2) {
      setCategoryStripOverflow(false);
      setCategoryStripEdges({ canLeft: false, canRight: false });
      return;
    }
    setCategoryStripOverflow(true);

    const rect = el.getBoundingClientRect();
    const c = getComputedStyle(el);
    const padL = parseFloat(c.paddingLeft) || 0;
    const padR = parseFloat(c.paddingRight) || 0;
    const bL = parseFloat(c.borderLeftWidth) || 0;
    const bR = parseFloat(c.borderRightWidth) || 0;
    const viewL = rect.left + bL;
    const viewR = rect.right - bR;
    const tol = 3;

    const first = el.firstElementChild as HTMLElement | null;
    const last = el.lastElementChild as HTMLElement | null;
    let canLeft = false;
    let canRight = false;
    if (first) {
      canLeft = first.getBoundingClientRect().left < viewL + padL - tol;
    }
    if (last) {
      canRight = last.getBoundingClientRect().right > viewR - padR + tol;
    }

    setCategoryStripEdges({ canLeft, canRight });
  }, []);

  const scrollCategoryStrip = useCallback((dir: "left" | "right") => {
    const el = categoryStripRef.current;
    if (!el) return;
    const first = el.firstElementChild as HTMLElement | undefined;
    const gapStr = getComputedStyle(el).gap;
    let gap = 0;
    if (gapStr && gapStr !== "normal") {
      const token = gapStr.trim().split(/\s+/)[0] ?? "";
      const parsed = parseFloat(token);
      if (Number.isFinite(parsed)) gap = parsed;
    }
    const cardStep = first && first.offsetWidth > 0 ? first.offsetWidth + gap : 0;
    const step = cardStep > 0 ? cardStep : Math.max(220, Math.round(el.clientWidth * 0.72));
    el.scrollBy({ left: dir === "left" ? -step : step, behavior: "smooth" });
  }, []);

  useEffect(() => {
    if (!storeFetched) return;
    const el = categoryStripRef.current;
    if (!el) return;
    updateCategoryStripEdges();
    const onScroll = () => updateCategoryStripEdges();
    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("scrollend", onScroll);
    window.addEventListener("resize", onScroll, { passive: true });
    const RO = typeof ResizeObserver !== "undefined" ? ResizeObserver : null;
    const ro = RO ? new RO(onScroll) : null;
    ro?.observe(el);
    const t = window.setTimeout(onScroll, 0);
    return () => {
      window.clearTimeout(t);
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("scrollend", onScroll);
      window.removeEventListener("resize", onScroll);
      ro?.disconnect();
    };
  }, [storeFetched, displayCategories.length, updateCategoryStripEdges]);

  const filteredProducts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const pool = query ? storeData.products : visibleProducts;
    if (!query) return pool;

    return pool.filter((product) => {
      const categoryName = categoriesBySlug[product.categorySlug]?.name ?? "";
      const variantHaystack = (product.variants ?? [])
        .flatMap((variant) => [
          variant.color ?? "",
          variant.memory ?? "",
          variant.simType ?? "",
          variant.screen ?? "",
          variant.ram ?? ""
        ])
        .join(" ");
      const haystack = [product.name, product.color ?? "", product.description ?? "", categoryName, variantHaystack]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [categoriesBySlug, searchQuery, storeData.products, visibleProducts]);

  const shownCatalogProducts = useMemo(
    () => filteredProducts.slice(0, catalogVisibleCount),
    [catalogVisibleCount, filteredProducts]
  );

  useEffect(() => {
    setCatalogVisibleCount(CATALOG_PAGE_SIZE);
  }, [pathname, searchQuery]);

  const visibleReviewPhotos = useMemo(() => {
    if (!reviewPhotos.length) return [];
    const total = reviewPhotos.length;
    const slots = Math.min(5, total);
    const offset = Math.floor(slots / 2);

    return Array.from({ length: slots }, (_, slot) => {
      const index = (reviewSlideIndex - offset + slot + total) % total;
      return {
        photo: reviewPhotos[index],
        index,
        isCenter: slot === offset
      };
    });
  }, [reviewPhotos, reviewSlideIndex]);

  const cartCount = useMemo(() => {
    return cartItems.reduce((sum, item) => sum + item.quantity, 0);
  }, [cartItems]);

  const addToCart = useCallback(
    (
      product: Product,
      selection: VariantSelection & { price: number; imageUrl: string }
    ) => {
      const key = [
        product.id,
        selection.color ?? "",
        selection.memory ?? "",
        selection.simType ?? "",
        selection.screen ?? "",
        selection.ram ?? ""
      ].join("|");
      setCartItems((prev) => {
        let nextItems: CartItem[];
        const existing = prev.find((item) => item.key === key);
        if (existing) {
          nextItems = prev.map((item) => (item.key === key ? { ...item, quantity: item.quantity + 1 } : item));
        } else {
          nextItems = [
            ...prev,
            {
              key,
              productId: product.id,
              name: product.name,
              color: selection.color,
              memory: selection.memory,
              simType: selection.simType,
              screen: selection.screen,
              ram: selection.ram,
              price: selection.price,
              imageUrl: selection.imageUrl,
              quantity: 1
            }
          ];
        }
        persistCartItems(nextItems);
        return nextItems;
      });
      setLeadNotice({ type: "success", message: "Товар добавлен в корзину." });
    },
    []
  );

  const breadcrumbs = useMemo(() => {
    const crumbs: string[] = ["Главная"];
    if (routeCategorySlug) {
      crumbs.push("Каталог");
      crumbs.push(activeCategory?.name ?? routeCategorySlug);
    }
    return crumbs.join(" / ");
  }, [activeCategory?.name, routeCategorySlug]);

  const formatPhone = useCallback((value: string): string => {
    const digits = value.replace(/\D/g, "");
    const normalized = digits.startsWith("8") ? `7${digits.slice(1)}` : digits;
    const trimmed = normalized.startsWith("7") ? normalized.slice(1, 11) : normalized.slice(0, 10);
    const parts = [
      trimmed.slice(0, 3),
      trimmed.slice(3, 6),
      trimmed.slice(6, 8),
      trimmed.slice(8, 10)
    ].filter(Boolean);

    if (!trimmed.length) return "";
    if (trimmed.length <= 3) return `+7 (${parts[0]}`;
    if (trimmed.length <= 6) return `+7 (${parts[0]}) ${parts[1] ?? ""}`;
    if (trimmed.length <= 8) return `+7 (${parts[0]}) ${parts[1] ?? ""}-${parts[2] ?? ""}`;
    return `+7 (${parts[0]}) ${parts[1] ?? ""}-${parts[2] ?? ""}-${parts[3] ?? ""}`;
  }, []);

  const onPhoneInput = useCallback((value: string, apply: (next: string) => void) => {
    apply(formatPhone(value));
  }, [formatPhone]);

  const submitLead = async (payload: {
    type: "tradein" | "assessment" | "order";
    phone: string;
    deviceFrom?: string;
    deviceTo?: string;
    targetDevice?: string;
    productName?: string;
    color?: string;
    memory?: string;
    simType?: string;
    screen?: string;
    ram?: string;
    customerName?: string;
    telegram?: string;
  }) => {
    if (!payload.phone.trim()) return;
    try {
      setSendingLead(true);
      await createLead(payload);
      setActiveModal(null);
      setOrderSelection(null);
      setLeadNotice({ type: "success", message: "Заявка отправлена, мы скоро с вами свяжемся." });
    } catch {
      setLeadNotice({ type: "error", message: "Не удалось отправить заявку. Попробуйте еще раз." });
    } finally {
      setSendingLead(false);
    }
  };

  const modal = useMemo(() => {
    if (activeModal === "tradein") {
      return (
        <Modal
          title="Заявка на Trade-In"
          subtitle="Оставьте заявку на Trade-In и мы в ближайшее время свяжемся с вами"
          iconSrc="/icon/icon2.svg"
          iconAlt="Иконка Trade-In"
          onClose={() => setActiveModal(null)}
        >
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const phone = (form.elements.namedItem("phone") as HTMLInputElement | null)?.value ?? "";
              const deviceFrom = (form.elements.namedItem("deviceFrom") as HTMLInputElement | null)?.value ?? "";
              const deviceTo = (form.elements.namedItem("deviceTo") as HTMLInputElement | null)?.value ?? "";
              void submitLead({ type: "tradein", phone, deviceFrom, deviceTo });
            }}
          >
            <input
              name="phone"
              className="field"
              placeholder="+7 (999) 123-45-67"
              inputMode="tel"
              maxLength={18}
              onChange={(e) => onPhoneInput(e.target.value, (next) => (e.target.value = next))}
            />
            <div className="grid grid-cols-1 gap-3 min-[640px]:grid-cols-2">
              <input name="deviceFrom" className="field" placeholder="Например, iPhone 13 Pro 256 ГБ" />
              <input name="deviceTo" className="field" placeholder="Например, iPhone 16 Pro 256 ГБ" />
            </div>
            <label className="flex items-start gap-2 text-xs text-zinc-500">
              <input type="checkbox" className="mt-0.5 accent-red-500" defaultChecked />
              <span>
                Я согласен с{" "}
                <Link href="/policy" className="font-medium text-red-500 underline-offset-2 hover:underline">
                  политикой конфиденциальности
                </Link>{" "}
                и принимаю{" "}
                <Link href="/offer" className="font-medium text-red-500 underline-offset-2 hover:underline">
                  условия оферты
                </Link>
              </span>
            </label>
            <button
              type="submit"
              className="btn-primary flex w-full items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-70"
              disabled={sendingLead}
            >
              {sendingLead ? (
                <>
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  Отправка...
                </>
              ) : (
                "Отправить"
              )}
            </button>
          </form>
        </Modal>
      );
    }

    if (activeModal === "reviews") {
      if (IS_SOTIK_BRAND) {
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 min-[640px]:p-4"
            onClick={() => setActiveModal(null)}
          >
            <div
              className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-[#6f89ff]/40 bg-[#10131f] p-6 text-white shadow-[0_24px_60px_rgba(58,91,255,0.22)] ring-1 ring-[#6f89ff]/25 min-[640px]:max-w-xl min-[640px]:p-8"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="absolute right-3 top-3 z-20 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#6f89ff]/35 bg-[#10131f]/80 text-lg text-[#b8c8ff] backdrop-blur-sm transition hover:border-[#6f89ff]/55 hover:bg-[#151a2a] hover:text-white"
                aria-label="Закрыть"
              >
                ×
              </button>

              <div className="relative z-10 mx-auto max-w-md pt-2 text-center min-[640px]:max-w-lg">
                <p className="inline-flex rounded-full border border-[#6f89ff]/40 bg-[#6f89ff]/15 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-[#b8c8ff]">
                  Avito
                </p>
                <h3 className="mt-4 text-3xl font-bold leading-tight min-[640px]:text-4xl min-[640px]:text-5xl">Отзывы клиентов</h3>
                <p className="mt-3 text-sm text-zinc-200/90 min-[640px]:text-lg">Более тысячи клиентов доверяют нам.</p>
                <a
                  href={SOTIK_AVITO_REVIEWS_HREF}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mx-auto mt-8 inline-flex min-h-12 w-full max-w-xs items-center justify-center rounded-2xl bg-gradient-to-r from-[#6f89ff] via-[#4c7dff] to-[#1f63ff] px-8 py-3.5 text-sm font-semibold text-white shadow-[0_10px_28px_rgba(49,78,255,0.4)] transition hover:brightness-110 min-[640px]:mt-10 min-[640px]:max-w-sm min-[640px]:py-4 min-[640px]:text-base"
                >
                  Мы на Avito
                </a>
              </div>

              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/avito.png"
                alt=""
                aria-hidden="true"
                className="pointer-events-none absolute -right-4 -bottom-6 h-36 w-36 rotate-[-12deg] object-contain opacity-30 blur-[0.3px] min-[640px]:-right-6 min-[640px]:-bottom-8 min-[640px]:h-44 min-[640px]:w-44"
              />
              <div className="pointer-events-none absolute -left-10 top-1/2 h-40 w-40 -translate-y-1/2 rounded-full bg-[#00d19b]/18 blur-3xl" />
              <div className="pointer-events-none absolute right-0 top-0 h-48 w-48 rounded-full bg-[#6f89ff]/28 blur-3xl" />
              <div className="pointer-events-none absolute bottom-0 right-1/4 h-36 w-36 rounded-full bg-[#ff6f4b]/22 blur-3xl" />
            </div>
          </div>
        );
      }

      return (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 min-[640px]:p-4"
          onClick={() => setActiveModal(null)}
        >
          <div
            className="relative w-full max-w-[640px] overflow-hidden rounded-3xl border border-zinc-800 bg-[#121317] p-5 text-white shadow-[0_24px_60px_rgba(0,0,0,0.45)] ring-1 ring-white/5 min-[640px]:p-7"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setActiveModal(null)}
              className="absolute right-4 top-3 z-20 text-xl text-zinc-500 transition hover:text-zinc-200"
            >
              ×
            </button>

            <div className="relative z-10 max-w-[24rem]">
              <p className="mb-3 inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-red-400">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-400" />
                Нам доверяют
              </p>
              <h3 className="text-4xl font-bold leading-tight min-[640px]:text-5xl">Отзывы клиентов</h3>
              <p className="mt-2 text-sm leading-6 text-zinc-300">
                Средняя оценка 5,0 на 2ГИС и более 100 отзывов подтверждают высокий уровень сервиса и качество нашей работы.
              </p>
            </div>

            <a
              href="https://2gis.ru"
              target="_blank"
              rel="noopener noreferrer"
              className="relative z-10 mt-6 inline-flex h-12 w-full items-center justify-center rounded-2xl bg-red-500 px-4 text-sm font-semibold uppercase tracking-[0.08em] transition hover:bg-red-600 min-[640px]:mt-8 min-[640px]:max-w-[18rem]"
            >
              Перейти в 2ГИС
            </a>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/test1.png"
              alt="Отзывы клиентов в 2ГИС"
              className="pointer-events-none absolute -right-10 -bottom-14 h-[128%] w-auto object-contain min-[640px]:-right-6 min-[640px]:-bottom-16 min-[640px]:h-[136%]"
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/35 via-transparent to-transparent" />
          </div>
        </div>
      );
    }

    if (activeModal === "preorder") {
      return (
        <Modal
          title="Под заказ"
          subtitle="Заполните форму — менеджер уточнит наличие, сроки и стоимость"
          hideBadge
          onClose={() => setActiveModal(null)}
        >
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const customerName = (form.elements.namedItem("customerName") as HTMLInputElement | null)?.value ?? "";
              const phone = (form.elements.namedItem("phone") as HTMLInputElement | null)?.value ?? "";
              const telegram = (form.elements.namedItem("telegram") as HTMLInputElement | null)?.value ?? "";
              const targetDevice = (form.elements.namedItem("targetDevice") as HTMLInputElement | null)?.value ?? "";
              if (!customerName.trim() || !phone.trim() || !targetDevice.trim()) return;
              void submitLead({
                type: "order",
                phone,
                customerName: customerName.trim(),
                telegram: telegram.trim() || undefined,
                targetDevice: targetDevice.trim(),
                productName: "Под заказ"
              });
            }}
          >
            <input name="customerName" className="field" placeholder="ФИО" required />
            <input
              name="phone"
              className="field"
              placeholder="+7 (999) 123-45-67"
              inputMode="tel"
              maxLength={18}
              required
              onChange={(e) => onPhoneInput(e.target.value, (next) => (e.target.value = next))}
            />
            <input name="telegram" className="field" placeholder="Telegram (не обязательно)" />
            <input name="targetDevice" className="field" placeholder="Желаемый товар" required />
            <button
              type="submit"
              className="btn-primary flex w-full items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-70"
              disabled={sendingLead}
            >
              {sendingLead ? "Отправка..." : "Отправить"}
            </button>
          </form>
        </Modal>
      );
    }

    if (activeModal === "order") {
      return (
        <Modal
          title="Заказать устройство"
          subtitle="Оставьте заявку на заказ и мы в ближайшее время свяжемся с вами"
          hideBadge
          onClose={() => {
            setActiveModal(null);
            setOrderSelection(null);
          }}
        >
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const phone = (form.elements.namedItem("phone") as HTMLInputElement | null)?.value ?? "";
              const targetDevice = (form.elements.namedItem("targetDevice") as HTMLInputElement | null)?.value ?? "";
              void submitLead({
                type: "order",
                phone,
                targetDevice,
                productName: orderSelection?.productName,
                color: orderSelection?.color,
                memory: orderSelection?.memory,
                simType: orderSelection?.simType,
                screen: orderSelection?.screen,
                ram: orderSelection?.ram
              });
            }}
          >
            <input
              name="phone"
              className="field"
              placeholder="+7 (999) 123-45-67"
              inputMode="tel"
              maxLength={18}
              onChange={(e) => onPhoneInput(e.target.value, (next) => (e.target.value = next))}
            />
            <input name="targetDevice" className="field" placeholder={'Например, MacBook Air M2 13"'} />
            <label className="flex items-start gap-2 text-xs text-zinc-500">
              <input type="checkbox" className="mt-0.5 accent-red-500" defaultChecked />
              <span>
                Я согласен с{" "}
                <Link href="/policy" className="font-medium text-red-500 underline-offset-2 hover:underline">
                  политикой конфиденциальности
                </Link>{" "}
                и принимаю{" "}
                <Link href="/offer" className="font-medium text-red-500 underline-offset-2 hover:underline">
                  условия оферты
                </Link>
              </span>
            </label>
            <button
              type="submit"
              className="btn-primary flex w-full items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-70"
              disabled={sendingLead}
            >
              {sendingLead ? (
                <>
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  Отправка...
                </>
              ) : (
                "Отправить"
              )}
            </button>
          </form>
        </Modal>
      );
    }

    if (activeModal === "product" && selectedProduct) {
      const selectedCategory = categoriesBySlug[selectedProduct.categorySlug];
      const productCategorySlug = selectedCategory?.slug ?? selectedProduct.categorySlug;
      const isIphoneCategory = isIphoneLikeSlug(productCategorySlug);
      const isMacbookCategory = isMacbookLikeSlug(productCategorySlug);
      const isIpadCategory = isIpadLikeSlug(productCategorySlug);
      const isWatchCategory = isWatchLikeSlug(productCategorySlug);
      const usesMemory = isIphoneCategory || isMacbookCategory || isIpadCategory;
      const usesScreen = isMacbookCategory || isIpadCategory || isWatchCategory;
      const usesRam = isMacbookCategory;
      const showSimSelector = isIphoneCategory || isIpadCategory || isWatchCategory;
      const simLabelModal = isIphoneCategory ? "тип SIM" : isIpadCategory ? "связь" : isWatchCategory ? "ремешок" : "SIM";
      const productVariants = effectiveVariantsForProduct(selectedProduct, productCategorySlug);
      const hasVariants = productVariants.length > 0;
      const colorOptions = hasVariants
        ? Array.from(new Set(productVariants.map((item) => item.color).filter((item): item is string => Boolean(item))))
        : selectedProduct.color
          ? [selectedProduct.color]
          : [];
      const colorFilter = selectedProductColor || colorOptions[0] || "";
      const colorScopedVariants = hasVariants
        ? productVariants.filter((item) => !colorFilter || item.color === colorFilter)
        : [];
      const matchesExcept = (
        item: typeof productVariants[number],
        excludeKey: keyof VariantSelection
      ) =>
        (excludeKey === "memory" || !usesMemory || !selectedProductMemory || item.memory === selectedProductMemory) &&
        (excludeKey === "simType" || !showSimSelector || !selectedProductSim || item.simType === selectedProductSim) &&
        (excludeKey === "screen" || !usesScreen || !selectedProductScreen || item.screen === selectedProductScreen) &&
        (excludeKey === "ram" || !usesRam || !selectedProductRam || item.ram === selectedProductRam);
      const memoryOptions = hasVariants && usesMemory
        ? Array.from(new Set(colorScopedVariants.filter((item) => matchesExcept(item, "memory")).map((item) => item.memory).filter((item): item is string => Boolean(item))))
        : [];
      const simOptions = hasVariants && showSimSelector
        ? Array.from(new Set(colorScopedVariants.filter((item) => matchesExcept(item, "simType")).map((item) => item.simType).filter((item): item is string => Boolean(item))))
        : [];
      const screenOptions = hasVariants && usesScreen
        ? Array.from(new Set(colorScopedVariants.filter((item) => matchesExcept(item, "screen")).map((item) => item.screen).filter((item): item is string => Boolean(item))))
        : [];
      const ramOptions = hasVariants && usesRam
        ? Array.from(new Set(colorScopedVariants.filter((item) => matchesExcept(item, "ram")).map((item) => item.ram).filter((item): item is string => Boolean(item))))
        : [];

      const activeVariant = hasVariants
        ? productVariants.find(
            (item) =>
              (!colorFilter || item.color === colorFilter) &&
              (!usesMemory || !selectedProductMemory || item.memory === selectedProductMemory) &&
              (!showSimSelector || !selectedProductSim || item.simType === selectedProductSim) &&
              (!usesScreen || !selectedProductScreen || item.screen === selectedProductScreen) &&
              (!usesRam || !selectedProductRam || item.ram === selectedProductRam)
          ) ??
          productVariants.find((item) => !colorFilter || item.color === colorFilter) ??
          productVariants[0]
        : null;

      const shownModalPrice = activeVariant?.price ?? selectedProduct.basePrice;
      const shownModalCompareAt = resolveCompareAtPrice(shownModalPrice, activeVariant, selectedProduct);
      const shownModalImage = activeVariant?.imageUrl ?? selectedProduct.imageUrl;
      const modalStockBadge = availabilityBadgeText(
        activeVariant?.availability,
        activeVariant ? activeVariant.price : selectedProduct.basePrice
      );
      const modalCanCart = variantCanAddToCart(
        activeVariant ?? { price: selectedProduct.basePrice, availability: undefined }
      );
      return (
        <Modal
          title={selectedProduct.name}
          subtitle={(activeVariant?.color ?? selectedProduct.color) ? `Цвет: ${activeVariant?.color ?? selectedProduct.color}` : "Оригинальная техника Apple"}
          hideBadge
          noScroll
          onClose={() => {
            setActiveModal(null);
            setSelectedProduct(null);
            setSelectedProductMemory("");
            setSelectedProductColor("");
            setSelectedProductSim("");
            setSelectedProductScreen("");
            setSelectedProductRam("");
          }}
        >
          <div className="space-y-2 min-[640px]:grid min-[640px]:grid-cols-[minmax(220px,0.95fr)_minmax(260px,1.05fr)] min-[640px]:gap-4 min-[640px]:space-y-0">
            <div className="overflow-hidden rounded-xl bg-zinc-50 p-1.5 min-[640px]:h-full">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={shownModalImage} alt={selectedProduct.name} className="h-28 w-full object-contain min-[480px]:h-32 min-[640px]:h-full min-[640px]:min-h-[280px]" />
            </div>
            <div className="space-y-2 min-[640px]:space-y-3">
              <p className="line-clamp-2 text-xs leading-5 text-zinc-600 min-[640px]:text-sm">
                {selectedProduct.description ??
                  "Подробное описание для этого товара скоро появится. Вы можете оставить заявку, и менеджер уточнит все характеристики."}
              </p>
              {isIphoneCategory || isIpadCategory ? (
                <p className="rounded-xl border border-amber-200/90 bg-amber-50 px-2.5 py-1.5 text-[11px] font-medium leading-snug text-amber-950 min-[640px]:text-xs">
                  Имееться недостаток товара: невозможно установить и использовать RuStore.
                </p>
              ) : null}
              <div className="rounded-xl bg-zinc-50 p-2 text-xs text-zinc-600 min-[640px]:text-sm">
                <p>Категория: {selectedCategory?.name ?? "—"}</p>
                {colorOptions.length ? (
                  <div className="mt-1 space-y-1">
                    <p className="text-xs text-zinc-500">Выберите цвет</p>
                    <div className="flex flex-wrap gap-1">
                      {colorOptions.map((option) => (
                        <button
                          key={option}
                          type="button"
                          className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold transition min-[640px]:text-xs ${
                            selectedProductColor === option ? "bg-zinc-900 text-white" : "bg-white text-zinc-700 hover:bg-zinc-100"
                          }`}
                          onClick={() => {
                            setSelectedProductColor(option);
                            setSelectedProductMemory("");
                            setSelectedProductSim("");
                            setSelectedProductScreen("");
                            setSelectedProductRam("");
                          }}
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                {screenOptions.length ? (
                  <div className="mt-1 space-y-1">
                    <p className="text-xs text-zinc-500">{isWatchCategory ? "Выберите размер корпуса" : "Выберите диагональ"}</p>
                    <div className="flex flex-wrap gap-1">
                      {screenOptions.map((option) => (
                        <button
                          key={option}
                          type="button"
                          className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold transition min-[640px]:text-xs ${
                            selectedProductScreen === option ? "bg-zinc-900 text-white" : "bg-white text-zinc-700 hover:bg-zinc-100"
                          }`}
                          onClick={() => setSelectedProductScreen(option)}
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                {usesMemory ? (
                  memoryOptions.length ? (
                    <div className="mt-1 space-y-1">
                      <p className="text-xs text-zinc-500">{isMacbookCategory || isIpadCategory ? "Выберите накопитель" : "Выберите объем"}</p>
                      <div className="flex flex-wrap gap-1">
                        {memoryOptions.map((option) => (
                          <button
                            key={option}
                            type="button"
                            className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold transition min-[640px]:text-xs ${
                              selectedProductMemory === option ? "bg-zinc-900 text-white" : "bg-white text-zinc-700 hover:bg-zinc-100"
                            }`}
                            onClick={() => setSelectedProductMemory(option)}
                          >
                            {option}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="mt-1">{isMacbookCategory || isIpadCategory ? "Накопитель: не указан" : "Объем: не указан"}</p>
                  )
                ) : null}
                {ramOptions.length ? (
                  <div className="mt-1 space-y-1">
                    <p className="text-xs text-zinc-500">Выберите оперативную память</p>
                    <div className="flex flex-wrap gap-1">
                      {ramOptions.map((option) => (
                        <button
                          key={option}
                          type="button"
                          className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold transition min-[640px]:text-xs ${
                            selectedProductRam === option ? "bg-zinc-900 text-white" : "bg-white text-zinc-700 hover:bg-zinc-100"
                          }`}
                          onClick={() => setSelectedProductRam(option)}
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                {simOptions.length ? (
                  <div className="mt-1 space-y-1">
                    <p className="text-xs text-zinc-500">Выберите {simLabelModal}</p>
                    <div className="flex flex-wrap gap-1">
                      {simOptions.map((option) => (
                        <button
                          key={option}
                          type="button"
                          className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold transition min-[640px]:text-xs ${
                            selectedProductSim === option ? "bg-zinc-900 text-white" : "bg-white text-zinc-700 hover:bg-zinc-100"
                          }`}
                          onClick={() => setSelectedProductSim(option)}
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                {modalStockBadge ? (
                  <p className="mt-1 text-[11px] font-semibold text-amber-800 min-[640px]:text-xs">{modalStockBadge}</p>
                ) : null}
                <div className="mt-1">
                  <ProductPrice
                    price={shownModalPrice}
                    compareAtPrice={shownModalCompareAt}
                    label="Цена: "
                    unavailableText={
                      modalStockBadge === "Скоро в продаже" ? "скоро в продаже" : "по запросу"
                    }
                    size="modal"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-2 min-[640px]:grid-cols-2">
                <button
                  type="button"
                  className="btn-primary w-full py-2 text-sm"
                  onClick={() => {
                    setOrderSelection({
                      productName: selectedProduct.name,
                      color: (activeVariant?.color ?? selectedProductColor) || undefined,
                      memory: (activeVariant?.memory ?? selectedProductMemory) || undefined,
                      simType: (activeVariant?.simType ?? selectedProductSim) || undefined,
                      screen: (activeVariant?.screen ?? selectedProductScreen) || undefined,
                      ram: (activeVariant?.ram ?? selectedProductRam) || undefined
                    });
                    setSelectedProduct(null);
                    setActiveModal("order");
                  }}
                >
                  Заказать
                </button>
                <button
                  type="button"
                  disabled={!modalCanCart}
                  title={!modalCanCart ? "Недоступно для корзины" : undefined}
                  className="w-full rounded-xl border border-zinc-200 bg-white py-2 text-sm font-semibold text-zinc-800 transition hover:border-zinc-900 hover:bg-zinc-900 hover:text-white disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-zinc-200 disabled:hover:bg-white disabled:hover:text-zinc-800"
                  onClick={() => {
                    if (!modalCanCart) return;
                    addToCart(selectedProduct, {
                      color: (activeVariant?.color ?? selectedProductColor) || undefined,
                      memory: (activeVariant?.memory ?? selectedProductMemory) || undefined,
                      simType: (activeVariant?.simType ?? selectedProductSim) || undefined,
                      screen: (activeVariant?.screen ?? selectedProductScreen) || undefined,
                      ram: (activeVariant?.ram ?? selectedProductRam) || undefined,
                      price: shownModalPrice,
                      imageUrl: shownModalImage
                    });
                  }}
                >
                  В корзину
                </button>
              </div>
            </div>
          </div>
        </Modal>
      );
    }

    return null;
  }, [
    activeModal,
    addToCart,
    categoriesBySlug,
    onPhoneInput,
    orderSelection,
    selectedProduct,
    selectedProductColor,
    selectedProductMemory,
    selectedProductRam,
    selectedProductScreen,
    selectedProductSim,
    sendingLead
  ]);

  return (
    <div className="min-h-screen bg-[#f4f4f6] text-zinc-900">
      <div
        className={`hidden min-[960px]:block ${
          IS_SOTIK_BRAND ? "border-b border-white/5 bg-[#111112]" : "border-b border-zinc-200 bg-white"
        }`}
      >
        <div
          className={`mx-auto flex w-full max-w-[1920px] items-center justify-between gap-6 px-8 py-3 text-[13px] font-medium tracking-[0.01em] min-[1440px]:px-12 min-[1920px]:px-16 ${
            IS_SOTIK_BRAND ? "text-zinc-400" : "text-zinc-500"
          }`}
        >
          <div className="flex items-center gap-4">
            <Link
              href="/info#delivery"
              className={IS_SOTIK_BRAND ? "transition hover:text-white" : "transition hover:text-zinc-900"}
            >
              Доставка и оплата
            </Link>
            <span
              aria-hidden="true"
              className={`h-1 w-1 rounded-full ${IS_SOTIK_BRAND ? "bg-white/20" : "bg-zinc-300"}`}
            />
            <Link href="/info#return" className={IS_SOTIK_BRAND ? "transition hover:text-white" : "transition hover:text-zinc-900"}>
              Возврат и обмен
            </Link>
            <span
              aria-hidden="true"
              className={`h-1 w-1 rounded-full ${IS_SOTIK_BRAND ? "bg-white/20" : "bg-zinc-300"}`}
            />
            <Link href="/info#warranty" className={IS_SOTIK_BRAND ? "transition hover:text-white" : "transition hover:text-zinc-900"}>
              Гарантия и проверка
            </Link>
          </div>
          <div className="flex items-center gap-2">
            {IS_SOTIK_BRAND ? (
              <>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/10 px-3 py-1 text-red-300 ring-1 ring-inset ring-red-500/20">
                  <svg viewBox="0 0 20 20" aria-hidden="true" fill="currentColor" className="h-3.5 w-3.5">
                    <path d="M10 2a6 6 0 0 0-6 6c0 4.6 5.3 9.7 5.5 9.9a.7.7 0 0 0 1 0c.2-.2 5.5-5.3 5.5-9.9a6 6 0 0 0-6-6Zm0 8a2 2 0 1 1 0-4 2 2 0 0 1 0 4Z" />
                  </svg>
                  {SOTIK_HEADER_ADDRESS}
                </span>
                <span className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1 text-emerald-300 ring-1 ring-inset ring-emerald-500/20">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/70" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                  </span>
                  {SOTIK_OPEN_HOURS_BADGE}
                </span>
              </>
            ) : (
              <>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 text-red-600 ring-1 ring-inset ring-red-200">
                  <svg viewBox="0 0 20 20" aria-hidden="true" fill="currentColor" className="h-3.5 w-3.5">
                    <path d="M10 2a6 6 0 0 0-6 6c0 4.6 5.3 9.7 5.5 9.9a.7.7 0 0 0 1 0c.2-.2 5.5-5.3 5.5-9.9a6 6 0 0 0-6-6Zm0 8a2 2 0 1 1 0-4 2 2 0 0 1 0 4Z" />
                  </svg>
                  Омск, ул. Гагарина 3
                </span>
                <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-emerald-700 ring-1 ring-inset ring-emerald-200">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/70" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                  </span>
                  Сейчас открыто · 11:00–20:00
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      <header className="sticky top-0 z-40">
        <div
          className={`mx-auto flex w-full max-w-[1920px] items-center justify-between gap-3 px-4 transition-all duration-300 min-[640px]:px-6 min-[960px]:px-8 min-[1440px]:px-12 min-[1920px]:px-16 ${
            headerFloat
              ? "mt-3 rounded-full border border-white/70 bg-white/88 py-2 shadow-[0_16px_40px_rgba(24,24,27,0.12)] backdrop-blur-2xl"
              : IS_SOTIK_BRAND
                ? "border-b border-white/5 bg-[#111112] py-4 text-zinc-100 shadow-[0_8px_24px_rgba(0,0,0,0.35)] min-[640px]:py-5 min-[960px]:py-6"
                : "border-b border-white/50 liquid-glass py-4 min-[640px]:py-5 min-[960px]:py-6"
          }`}
        >
          <Link
            href="/"
            className={`inline-flex shrink-0 items-center font-bold tracking-tight transition-all duration-300 ${
              headerFloat
                ? "text-xl text-zinc-950 min-[1200px]:text-2xl min-[1440px]:text-3xl"
                : IS_SOTIK_BRAND
                  ? "text-2xl text-white min-[640px]:text-3xl min-[1440px]:text-4xl min-[1920px]:text-5xl"
                  : "text-2xl text-zinc-950 min-[640px]:text-3xl min-[1440px]:text-4xl min-[1920px]:text-5xl"
            }`}
          >
            <BrandMark />
          </Link>
          <nav
            className={`hidden h-11 items-center gap-1 rounded-full px-1.5 text-sm font-medium backdrop-blur-xl transition-all duration-300 min-[960px]:flex min-[1920px]:text-base ${
              headerFloat
                ? "border border-zinc-200 bg-zinc-50 text-zinc-700 ring-1 ring-white/60"
                : IS_SOTIK_BRAND
                  ? "border border-white/10 bg-white/[0.04] text-zinc-300"
                  : "border border-zinc-200 bg-zinc-50 text-zinc-700"
            }`}
          >
            {IS_SOTIK_BRAND ? (
              <>
                <Link
                  className={`inline-flex h-9 items-center rounded-full px-3 transition min-[1440px]:px-4 ${
                    pathname === "/assessment"
                      ? "bg-red-500/15 text-red-300 ring-1 ring-inset ring-red-500/30"
                      : "hover:bg-white/10 hover:text-white"
                  }`}
                  href="/assessment"
                >
                  Выкуп
                </Link>
                <button
                  className="inline-flex h-9 items-center rounded-full px-3 transition hover:bg-white/10 hover:text-white min-[1440px]:px-4"
                  type="button"
                  onClick={() => setActiveModal("tradein")}
                >
                  Trade-in
                </button>
                <Link
                  className={`inline-flex h-9 items-center gap-2 rounded-full px-3 transition min-[1440px]:px-4 ${
                    pathname === "/catalog"
                      ? "bg-red-500/15 text-red-300 ring-1 ring-inset ring-red-500/30"
                      : "hover:bg-white/10 hover:text-white"
                  }`}
                  href="/catalog"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/icon/catalog.svg" alt="" aria-hidden="true" className="h-4 w-4" />
                  Каталог
                </Link>
              </>
            ) : (
              <>
                <Link
                  className={`inline-flex h-9 items-center gap-2 rounded-full px-3 transition min-[1440px]:px-4 ${
                    pathname === "/catalog"
                      ? "bg-red-50 text-red-600 ring-1 ring-inset ring-red-200"
                      : "hover:bg-white hover:text-zinc-950"
                  }`}
                  href="/catalog"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/icon/catalog.svg" alt="" aria-hidden="true" className="h-4 w-4" />
                  Каталог
                </Link>
                <button
                  className="inline-flex h-9 items-center rounded-full px-3 transition hover:bg-white hover:text-zinc-950 min-[1440px]:px-4"
                  type="button"
                  onClick={() => setActiveModal("tradein")}
                >
                  Trade-in
                </button>
                <Link
                  className={`inline-flex h-9 items-center rounded-full px-3 transition min-[1440px]:px-4 ${
                    pathname === "/assessment"
                      ? "bg-red-50 text-red-600 ring-1 ring-inset ring-red-200"
                      : "hover:bg-white hover:text-zinc-950"
                  }`}
                  href="/assessment"
                >
                  Выкуп
                </Link>
              </>
            )}
            <button
              className={`inline-flex h-9 items-center rounded-full px-3 transition min-[1440px]:px-4 ${
                IS_SOTIK_BRAND ? "hover:bg-white/10 hover:text-white" : "hover:bg-white hover:text-zinc-950"
              }`}
              type="button"
              onClick={() => setActiveModal("reviews")}
            >
              Отзывы
            </button>
            <a
              className={`inline-flex h-9 items-center rounded-full px-3 transition min-[1440px]:px-4 ${
                IS_SOTIK_BRAND ? "hover:bg-white/10 hover:text-white" : "hover:bg-white hover:text-zinc-950"
              }`}
              href="#"
            >
              Статьи
            </a>
          </nav>
          <div className="flex shrink-0 items-center gap-2 min-[960px]:hidden">
            <Link
              href="/cart"
              className={`relative inline-flex h-11 w-11 items-center justify-center rounded-full shadow-sm transition-all duration-300 min-[640px]:h-12 min-[640px]:w-12 ${
                IS_SOTIK_BRAND
                  ? "border border-white/10 bg-white/5 text-zinc-100 hover:border-white/20 hover:bg-white/10"
                  : "border border-zinc-300 bg-white text-zinc-900"
              } ${headerFloat ? "ring-1 ring-white/60" : ""}`}
              aria-label="Корзина"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-5.5 w-5.5">
                <path d="M6 7h15l-1.5 9h-12z" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M6 7 5 3H2" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="9.5" cy="20" r="1.25" fill="currentColor" stroke="none" />
                <circle cx="17.5" cy="20" r="1.25" fill="currentColor" stroke="none" />
              </svg>
              <span className="absolute -right-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                {cartCount}
              </span>
            </Link>
            <button
              type="button"
              className={`inline-flex h-11 items-center gap-2 rounded-[1.2rem] px-3 text-sm font-semibold leading-none shadow-sm transition-all duration-300 min-[640px]:h-12 min-[640px]:gap-2.5 min-[640px]:rounded-[1.4rem] min-[640px]:px-4 min-[640px]:text-base ${
                IS_SOTIK_BRAND
                  ? "border border-white/10 bg-white/5 text-zinc-100 hover:border-white/20 hover:bg-white/10"
                  : "border border-zinc-300 bg-[#f2ecec] text-[#3f2430]"
              } ${headerFloat ? "ring-1 ring-white/60" : ""}`}
              aria-label={mobileMenuOpen ? "Закрыть меню" : "Открыть меню"}
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen((open) => !open)}
            >
              <span className="relative h-4 w-5">
                <span
                  className={`absolute left-0 top-0 h-0.5 w-5 rounded-full bg-current transition ${
                    mobileMenuOpen ? "translate-y-[7px] rotate-45" : ""
                  }`}
                />
                <span
                  className={`absolute left-0 top-[7px] h-0.5 w-5 rounded-full bg-current transition ${
                    mobileMenuOpen ? "opacity-0" : ""
                  }`}
                />
                <span
                  className={`absolute left-0 top-[14px] h-0.5 w-5 rounded-full bg-current transition ${
                    mobileMenuOpen ? "-translate-y-[7px] -rotate-45" : ""
                  }`}
                />
              </span>
              Меню
            </button>
          </div>
          <div
            className={`hidden h-10 items-center gap-2 transition-all duration-300 min-[960px]:flex`}
          >
            <Link
              href="/cart"
              className={`inline-flex h-10 items-center gap-2 rounded-full border px-3 text-xs font-semibold transition min-[1200px]:text-sm ${
                IS_SOTIK_BRAND
                  ? "border-white/10 bg-white/5 text-zinc-100 hover:border-white/20 hover:bg-white/10"
                  : "border-zinc-200 bg-zinc-50 text-zinc-800 hover:border-zinc-300 hover:bg-white"
              }`}
            >
              Корзина
              <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] text-white">
                {cartCount}
              </span>
            </Link>
            {!IS_SOTIK_BRAND ? (
              <a
                href={VK_HREF}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200 bg-zinc-50 transition hover:border-zinc-300 hover:bg-white"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/icon/vk.svg" alt="VK" className="h-4.5 w-4.5" />
              </a>
            ) : null}
            <a
              href={IS_SOTIK_BRAND ? SOTIK_TELEGRAM_HREF : "https://t.me"}
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-flex h-10 w-10 items-center justify-center rounded-full border transition ${
                IS_SOTIK_BRAND
                  ? "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10"
                  : "border-zinc-200 bg-zinc-50 hover:border-zinc-300 hover:bg-white"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icon/telegram.svg" alt="Telegram" className="h-4.5 w-4.5" />
            </a>
            <div
              className={`text-right text-[11px] font-medium leading-tight min-[1200px]:text-xs min-[1440px]:text-sm ${
                IS_SOTIK_BRAND ? "text-zinc-300" : "text-zinc-700"
              }`}
            >
              {IS_SOTIK_BRAND ? (
                <p>{SOTIK_PHONE_DISPLAY}</p>
              ) : (
                <>
                  <p>+7 (923) 696-93-77</p>
                  <p>+7 (923) 686-93-77</p>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1920px] px-4 py-6 min-[640px]:px-6 min-[640px]:py-8 min-[960px]:px-8 min-[960px]:py-10 min-[1440px]:px-12 min-[1920px]:px-16">
        {isPolicyPage ? (
          <section>
            <p className="mb-4 text-xs text-zinc-400 min-[640px]:mb-5 min-[640px]:text-sm">Главная / Политика конфиденциальности</p>
            <h1 className="mb-5 text-3xl font-bold text-zinc-900 min-[640px]:text-5xl">Политика конфиденциальности</h1>
            <article className="rounded-3xl border border-white/70 liquid-glass p-5 text-zinc-700 min-[640px]:p-7">
              <p className="text-sm leading-7 min-[640px]:text-base">
                Честная диагностика и прозрачный расчет без скрытых условий. Мы обрабатываем персональные данные только
                для связи по заявке, уточнения заказа и улучшения сервиса. Передача данных третьим лицам не
                осуществляется, за исключением случаев, предусмотренных законодательством.
              </p>
            </article>
          </section>
        ) : null}

        {isOfferPage ? (
          <section>
            <p className="mb-4 text-xs text-zinc-400 min-[640px]:mb-5 min-[640px]:text-sm">Главная / Публичная оферта</p>
            <h1 className="mb-5 text-3xl font-bold text-zinc-900 min-[640px]:text-5xl">Публичная оферта</h1>
            <article className="rounded-3xl border border-white/70 liquid-glass p-5 text-zinc-700 min-[640px]:p-7">
              <p className="text-sm leading-7 min-[640px]:text-base">
                Честная диагностика и прозрачный расчет без скрытых условий. Настоящая публичная оферта определяет
                порядок оформления заявок, условия согласования стоимости и сроки исполнения заказа. Отправка формы на
                сайте подтверждает согласие клиента с условиями оферты.
              </p>
            </article>
          </section>
        ) : null}

        {isInfoPage ? (
          <section>
            <p className="mb-4 text-xs text-zinc-400 min-[640px]:mb-5 min-[640px]:text-sm">Главная / Информация для клиента</p>
            <h1 className="mb-5 text-3xl font-bold text-zinc-900 min-[640px]:text-5xl">Покупателям</h1>
            <div className="space-y-5 min-[640px]:space-y-6">
              <article id="delivery" className="rounded-3xl border border-white/70 liquid-glass p-5 min-[640px]:p-7">
                <h2 className="text-2xl font-semibold text-zinc-900 min-[640px]:text-3xl">Доставка и оплата</h2>
                <p className="mt-3 max-w-3xl text-sm leading-7 text-zinc-600 min-[640px]:text-base">
                  Оформите заявку на сайте или по телефону. Менеджер подтвердит наличие, согласует итоговую стоимость,
                  способы доставки по Омску и в другие регионы, а также удобный формат оплаты.
                </p>
              </article>
              <article id="return" className="rounded-3xl border border-white/70 liquid-glass p-5 min-[640px]:p-7">
                <h2 className="text-2xl font-semibold text-zinc-900 min-[640px]:text-3xl">Возврат и обмен</h2>
                <p className="mt-3 max-w-3xl text-sm leading-7 text-zinc-600 min-[640px]:text-base">
                  Возврат или обмен возможен в соответствии с действующим законодательством РФ. Для обращения
                  подготовьте чек и сохраните комплектность товара и внешний вид устройства.
                </p>
              </article>
              <article id="warranty" className="rounded-3xl border border-white/70 liquid-glass p-5 min-[640px]:p-7">
                <h2 className="text-2xl font-semibold text-zinc-900 min-[640px]:text-3xl">Гарантия и проверка</h2>
                <p className="mt-3 max-w-3xl text-sm leading-7 text-zinc-600 min-[640px]:text-base">
                  Перед выдачей каждое устройство проходит проверку. На технику предоставляется гарантия, условия
                  которой менеджер уточняет при оформлении заказа.
                </p>
              </article>
            </div>
          </section>
        ) : null}

        {!isStaticPage ? (
          <>
        {isHomePage ? (
          <section className="mb-6 grid grid-cols-1 gap-3 min-[640px]:mb-8 min-[640px]:gap-4 min-[960px]:grid-cols-5 min-[960px]:gap-5">
            {IS_SOTIK_BRAND ? (
              <>
                <Link
                  href="/assessment"
                  className="relative flex min-h-[360px] flex-col overflow-hidden rounded-3xl bg-[#121317] liquid-glass-dark p-5 text-white min-[640px]:min-h-[420px] min-[640px]:p-7 min-[960px]:col-span-3"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/img2.png" alt="Выкуп техники" className="absolute inset-0 h-full w-full object-cover" />
                  <div className="pointer-events-none absolute inset-0 bg-black/45" />
                  <p className="relative z-10 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-red-400">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/icon/icon3.svg" alt="" aria-hidden="true" className="h-3.5 w-3.5" />
                    Оценка за 10 минут
                  </p>
                  <h1 className="relative z-10 mt-4 max-w-xl text-3xl font-bold leading-tight min-[640px]:text-4xl min-[1440px]:text-5xl">
                    Выкупим ваше устройство
                  </h1>
                  <p className="relative z-10 mt-3 max-w-xl text-sm text-zinc-300 min-[640px]:text-base">
                    Честная оценка и быстрый ответ менеджера.
                  </p>
                  <span className="relative z-10 mt-auto inline-flex min-h-12 min-w-40 items-center justify-center self-start rounded-2xl bg-red-500 px-10 py-3.5 text-base font-semibold text-white transition hover:bg-red-600 min-[640px]:min-h-16 min-[640px]:min-w-52 min-[640px]:px-14 min-[640px]:py-4 min-[640px]:text-xl">
                    Оценить устройство
                  </span>
                  <div className="pointer-events-none absolute -bottom-20 -right-16 h-56 w-56 rounded-full bg-red-500/25 blur-3xl" />
                </Link>

                <div className="grid grid-cols-1 gap-3 min-[640px]:gap-4 min-[960px]:col-span-2">
                  <button
                    type="button"
                    onClick={() => setActiveModal("tradein")}
                    className="group relative overflow-hidden rounded-3xl border border-white/70 liquid-glass p-5 text-left transition hover:-translate-y-0.5 hover:shadow-lg min-[640px]:p-6"
                  >
                    <p className="relative z-10 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-red-500">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src="/icon/icon2.svg" alt="" aria-hidden="true" className="h-3.5 w-3.5" />
                      Выгодный обмен
                    </p>
                    <h3 className="relative z-10 mt-3 max-w-[18rem] text-2xl font-bold leading-tight text-zinc-900 min-[640px]:text-3xl">
                      Условия по программе Trade-In
                    </h3>
                    <p className="relative z-10 mt-3 max-w-[16rem] text-sm text-zinc-500 min-[640px]:text-base">
                      Обменивайте текущее устройство на новую модель со скидкой.
                    </p>
                    <span className="relative z-10 mt-4 inline-block text-sm font-semibold text-red-500 group-hover:text-red-600">
                      Открыть заявку
                    </span>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/image.png"
                      alt="Trade-In"
                      className="pointer-events-none absolute -right-4 -top-6 h-[122%] w-auto object-contain opacity-95 min-[640px]:-right-6"
                    />
                  </button>

                  <Link
                    href="/catalog"
                    className="group relative block overflow-hidden rounded-3xl border border-white/70 liquid-glass p-5 text-left transition hover:-translate-y-0.5 hover:shadow-lg min-[640px]:p-6"
                  >
                    <p className="relative z-10 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-red-500">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src="/icon/icon1.svg" alt="" aria-hidden="true" className="h-3.5 w-3.5" />
                      Гарантия 12 месяцев
                    </p>
                    <h3 className="relative z-10 mt-3 max-w-[18rem] text-2xl font-bold leading-tight text-zinc-900 min-[640px]:text-3xl">
                      Каталог
                    </h3>
                    <p className="relative z-10 mt-3 max-w-[16rem] text-sm text-zinc-500 min-[640px]:text-base">
                      Смартфоны, ноутбуки и аксессуары.
                    </p>
                    <span className="relative z-10 mt-4 inline-block text-sm font-semibold text-red-500 group-hover:text-red-600">
                      Перейти в каталог
                    </span>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/img3.png"
                      alt="Каталог"
                      className="pointer-events-none absolute -right-5 top-1/2 h-[118%] w-auto -translate-y-1/2 object-contain opacity-95 min-[640px]:-right-7"
                    />
                  </Link>
                </div>
              </>
            ) : (
              <>
                <article className="relative flex min-h-[360px] flex-col overflow-hidden rounded-3xl bg-[#121317] liquid-glass-dark p-5 text-white min-[640px]:min-h-[420px] min-[640px]:p-7 min-[960px]:col-span-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/img3.png" alt="Магазин оригинальной техники" className="absolute inset-0 h-full w-full object-cover" />
                  <div className="pointer-events-none absolute inset-0 bg-black/45" />
                  <p className="relative z-10 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-red-400">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/icon/icon1.svg" alt="" aria-hidden="true" className="h-3.5 w-3.5" />
                    Гарантия 12 месяцев
                  </p>
                  <h1 className="relative z-10 mt-4 max-w-xl text-3xl font-bold leading-tight min-[640px]:text-4xl min-[1440px]:text-5xl">
                    Магазин оригинальной техники
                  </h1>
                  <p className="relative z-10 mt-3 max-w-xl text-sm text-zinc-300 min-[640px]:text-base">
                    Широкий ассортимент и экспертный подбор устройств под ваши задачи и бюджет.
                  </p>
                  <Link
                    href="/catalog"
                    className="relative z-10 mt-auto inline-flex min-h-12 min-w-40 items-center justify-center self-start rounded-2xl bg-red-500 px-10 py-3.5 text-base font-semibold text-white transition hover:bg-red-600 min-[640px]:min-h-16 min-[640px]:min-w-52 min-[640px]:px-14 min-[640px]:py-4 min-[640px]:text-xl"
                  >
                    Каталог
                  </Link>
                  <div className="pointer-events-none absolute -bottom-20 -right-16 h-56 w-56 rounded-full bg-red-500/25 blur-3xl" />
                </article>

                <div className="grid grid-cols-1 gap-3 min-[640px]:gap-4 min-[960px]:col-span-2">
                  <button
                    type="button"
                    onClick={() => setActiveModal("tradein")}
                    className="group relative overflow-hidden rounded-3xl border border-white/70 liquid-glass p-5 text-left transition hover:-translate-y-0.5 hover:shadow-lg min-[640px]:p-6"
                  >
                    <p className="relative z-10 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-red-500">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src="/icon/icon2.svg" alt="" aria-hidden="true" className="h-3.5 w-3.5" />
                      Выгодный обмен
                    </p>
                    <h3 className="relative z-10 mt-3 max-w-[18rem] text-2xl font-bold leading-tight text-zinc-900 min-[640px]:text-3xl">
                      Условия по программе Trade-In
                    </h3>
                    <p className="relative z-10 mt-3 max-w-[16rem] text-sm text-zinc-500 min-[640px]:text-base">
                      Обменивайте текущее устройство на новую модель со скидкой.
                    </p>
                    <span className="relative z-10 mt-4 inline-block text-sm font-semibold text-red-500 group-hover:text-red-600">
                      Открыть заявку
                    </span>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/image.png"
                      alt="Trade-In"
                      className="pointer-events-none absolute -right-4 -top-6 h-[122%] w-auto object-contain opacity-95 min-[640px]:-right-6"
                    />
                  </button>

                  <Link
                    href="/assessment"
                    className="group relative block overflow-hidden rounded-3xl border border-white/70 liquid-glass p-5 text-left transition hover:-translate-y-0.5 hover:shadow-lg min-[640px]:p-6"
                  >
                    <p className="relative z-10 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-red-500">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src="/icon/icon3.svg" alt="" aria-hidden="true" className="h-3.5 w-3.5" />
                      Оценка за 10 минут
                    </p>
                    <h3 className="relative z-10 mt-3 max-w-[18rem] text-2xl font-bold leading-tight text-zinc-900 min-[640px]:text-3xl">
                      Выкупим ваше устройство
                    </h3>
                    <p className="relative z-10 mt-3 max-w-[16rem] text-sm text-zinc-500 min-[640px]:text-base">
                      Честная оценка и быстрый ответ менеджера.
                    </p>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/img2.png"
                      alt="Оценка устройства"
                      className="pointer-events-none absolute -right-5 top-1/2 h-[118%] w-auto -translate-y-1/2 object-contain opacity-95 min-[640px]:-right-7"
                    />
                  </Link>
                </div>
              </>
            )}
          </section>
        ) : null}

        {isHomePage ? (
          <h2 className="mb-4 inline-flex items-center gap-3 text-2xl font-bold text-zinc-900 min-[640px]:mb-5 min-[640px]:text-3xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon/catalog.svg" alt="" aria-hidden="true" className="h-5 w-5 min-[640px]:h-6 min-[640px]:w-6" />
            Каталог
          </h2>
        ) : (
          <p className="mb-4 text-xs text-zinc-400 min-[640px]:mb-5 min-[640px]:text-sm">{breadcrumbs}</p>
        )}

        <section
          className={
            isHomePage ? "relative rounded-2xl border border-white/60 liquid-glass p-2 min-[640px]:p-3" : "relative"
          }
        >
          {categoryStripOverflow && categoryStripEdges.canLeft ? (
            <button
              type="button"
              aria-label="Прокрутить категории назад"
              onClick={() => scrollCategoryStrip("left")}
              className="absolute left-1 top-1/2 z-20 flex h-9 w-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-zinc-300/90 bg-white/95 text-lg font-semibold leading-none text-zinc-800 shadow-md backdrop-blur-sm transition-all duration-300 ease-out hover:border-red-400 hover:bg-red-50 hover:text-red-600 hover:shadow-[0_10px_28px_-6px_rgba(239,68,68,0.38)] min-[640px]:left-2 min-[640px]:h-10 min-[640px]:w-10"
            >
              ‹
            </button>
          ) : null}
          {categoryStripOverflow && categoryStripEdges.canRight ? (
            <button
              type="button"
              aria-label="Прокрутить категории вперёд"
              onClick={() => scrollCategoryStrip("right")}
              className="absolute right-1 top-1/2 z-20 flex h-9 w-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-zinc-300/90 bg-white/95 text-lg font-semibold leading-none text-zinc-800 shadow-md backdrop-blur-sm transition-all duration-300 ease-out hover:border-red-400 hover:bg-red-50 hover:text-red-600 hover:shadow-[0_10px_28px_-6px_rgba(239,68,68,0.38)] min-[640px]:right-2 min-[640px]:h-10 min-[640px]:w-10"
            >
              ›
            </button>
          ) : null}
          <div
            ref={categoryStripRef}
            className={`flex flex-nowrap gap-1.5 overflow-x-auto overscroll-x-contain scroll-smooth py-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden snap-x snap-mandatory min-[480px]:gap-2 min-[640px]:gap-2.5 min-[960px]:gap-3 ${categoryStripEdges.canLeft ? "pl-10 min-[640px]:pl-12" : isHomePage ? "pl-1 min-[640px]:pl-2" : "pl-0"} ${categoryStripEdges.canRight ? "pr-10 min-[640px]:pr-12" : isHomePage ? "pr-1 min-[640px]:pr-2" : "pr-0"}`}
          >
            {storeFetched
              ? displayCategories.map((category) => (
                  <CategoryCard
                    key={category.id}
                    category={category}
                    onPodZakaz={category.slug === "custom" ? () => setActiveModal("preorder") : undefined}
                  />
                ))
              : <CategoryStripSkeleton />}
          </div>
        </section>

        {isHomePage ? (
          <section className="mt-6 min-[640px]:mt-8">
            <button
              type="button"
              onClick={() => setActiveModal("tradein")}
              className="group relative w-full overflow-hidden rounded-3xl border border-zinc-800 bg-[#121317] liquid-glass-dark p-5 text-left text-white shadow-[0_14px_34px_rgba(0,0,0,0.22)] ring-1 ring-white/5 transition hover:-translate-y-0.5 hover:shadow-[0_18px_40px_rgba(0,0,0,0.3)] min-[640px]:p-7"
            >
              <div className="relative z-10 flex h-full max-w-[38rem] flex-col">
                <p className="text-xs font-semibold uppercase tracking-widest text-red-400">Выгодный обмен</p>
                <h3 className="mt-3 text-3xl font-bold leading-tight min-[640px]:text-5xl">Программа TRADE-IN</h3>
                <p className="mt-3 text-sm text-zinc-300 min-[640px]:text-lg">
                  Обменивайте ваше текущее устройство на новую модель со скидкой
                </p>
                <span className="mt-6 inline-flex min-w-[230px] self-start items-center justify-center rounded-2xl bg-red-500 px-7 py-3 text-sm font-semibold text-white transition group-hover:bg-red-600 min-[640px]:mt-8 min-[640px]:min-w-[240px] min-[640px]:px-10 min-[640px]:py-4">
                  Рассчитать Trade-In
                </span>
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/image.png"
                alt="Trade-In"
                className="pointer-events-none absolute -right-6 -bottom-12 h-[130%] w-auto object-contain min-[640px]:-right-2 min-[640px]:-bottom-16 min-[960px]:-bottom-10 min-[960px]:h-[145%]"
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/35 via-transparent to-transparent" />
            </button>
          </section>
        ) : null}

        {isHomePage ? (
          <section className="mt-8 rounded-3xl border border-white/60 liquid-glass p-4 min-[640px]:mt-10 min-[640px]:p-6">
            <p className="text-xs font-semibold uppercase tracking-widest text-red-500">Оценка за 10 минут</p>
            <h3 className="mt-2 text-3xl font-bold text-zinc-900 min-[640px]:text-5xl">Выкуп техники</h3>

            <div className="mt-5 grid grid-cols-1 gap-3 min-[640px]:mt-6 min-[640px]:grid-cols-2 min-[640px]:gap-4 min-[960px]:grid-cols-3">
              <article className="rounded-2xl border border-white/70 liquid-glass p-4 min-[640px]:rounded-3xl min-[640px]:p-5">
                <div className="mb-4 inline-flex h-8 w-8 items-center justify-center rounded-xl border border-zinc-200 text-sm text-red-500">
                  ◉
                </div>
                <h4 className="text-xl font-semibold text-zinc-900 min-[640px]:text-2xl">Честная оценка</h4>
                <p className="mt-2 text-sm text-zinc-500 min-[640px]:text-base">
                  Честная диагностика и прозрачный расчет без скрытых условий
                </p>
              </article>

              <article className="rounded-2xl border border-white/70 liquid-glass p-4 min-[640px]:rounded-3xl min-[640px]:p-5">
                <div className="mb-4 inline-flex h-8 w-8 items-center justify-center rounded-xl border border-zinc-200 text-sm text-red-500">
                  ◎
                </div>
                <h4 className="text-xl font-semibold text-zinc-900 min-[640px]:text-2xl">Быстрая сделка</h4>
                <p className="mt-2 text-sm text-zinc-500 min-[640px]:text-base">
                  Оформление и расчет в день обращения без ожиданий и лишних процедур
                </p>
              </article>

              <article className="rounded-2xl border border-white/70 liquid-glass p-4 min-[640px]:rounded-3xl min-[640px]:p-5">
                <div className="mb-4 inline-flex h-8 w-8 items-center justify-center rounded-xl border border-zinc-200 text-sm text-red-500">
                  ◍
                </div>
                <h4 className="text-xl font-semibold text-zinc-900 min-[640px]:text-2xl">Безопасно и официально</h4>
                <p className="mt-2 text-sm text-zinc-500 min-[640px]:text-base">
                  Работаем открыто, фиксируем сделку и гарантируем корректность расчета
                </p>
              </article>
            </div>
          </section>
        ) : null}

        {isHomePage ? (
          <section className="mt-8 rounded-3xl border border-white/60 liquid-glass p-4 min-[640px]:mt-10 min-[640px]:p-6">
            <p className="text-xs font-semibold uppercase tracking-widest text-red-500">Быстро и удобно</p>
            <h3 className="mt-2 text-3xl font-bold text-zinc-900 min-[640px]:text-5xl">Доставка и оплата</h3>

            <div className="mt-5 grid grid-cols-1 gap-3 min-[640px]:mt-6 min-[640px]:gap-4 min-[960px]:grid-cols-3">
              <article className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-[#111217] liquid-glass-dark p-4 text-white shadow-[0_14px_34px_rgba(0,0,0,0.22)] ring-1 ring-white/5 min-[640px]:rounded-3xl min-[640px]:p-5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/next.png" alt="Доставка" className="pointer-events-none absolute right-0 top-0 h-full w-auto object-cover opacity-95" />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/70 via-black/45 to-transparent" />
                <div className="relative z-10">
                  <p className="mb-10 inline-flex rounded-xl border border-red-300/40 bg-black/30 px-3 py-1 text-xs font-semibold text-red-300">
                    Омск, ул. Гагарина 3
                  </p>
                  <h4 className="text-xl font-semibold min-[640px]:text-2xl">Самовывоз и доставка</h4>
                  <p className="mt-2 max-w-sm text-sm text-zinc-300 min-[640px]:text-base">
                    Предусмотрен удобный самовывоз, а также оперативная доставка по городу с соблюдением сроков.
                  </p>
                </div>
              </article>

              <article className="rounded-2xl border border-white/70 liquid-glass p-4 min-[640px]:rounded-3xl min-[640px]:p-5">
                <div className="mb-4 inline-flex h-8 w-8 items-center justify-center rounded-xl border border-zinc-200 text-sm text-red-500">
                  ◌
                </div>
                <h4 className="text-xl font-semibold text-zinc-900 min-[640px]:text-2xl">Способы оплаты</h4>
                <p className="mt-2 text-sm text-zinc-500 min-[640px]:text-base">
                  Принимаем наличный и безналичный расчет, обеспечивая безопасное и прозрачное проведение сделки.
                </p>
                <button
                  type="button"
                  onClick={() => (window.location.href = "/catalog")}
                  className="mt-5 w-full rounded-2xl border border-zinc-300 bg-red-50 py-2.5 text-sm font-semibold text-red-500 transition-all duration-200 hover:-translate-y-0.5 hover:border-zinc-900 hover:bg-zinc-900 hover:text-white hover:shadow-[0_10px_24px_rgba(24,24,27,0.25)]"
                >
                  Перейти в каталог
                </button>
              </article>

              <article className="rounded-2xl border border-white/70 liquid-glass p-4 min-[640px]:rounded-3xl min-[640px]:p-5">
                <div className="mb-4 inline-flex h-8 w-8 items-center justify-center rounded-xl border border-zinc-200 text-sm text-red-500">
                  ◍
                </div>
                <h4 className="text-xl font-semibold text-zinc-900 min-[640px]:text-2xl">Сроки под заказ</h4>
                <p className="mt-2 text-sm text-zinc-500 min-[640px]:text-base">
                  Поставки устройств под заказ согласовываются индивидуально, с предварительным подтверждением сроков.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setOrderSelection(null);
                    setActiveModal("order");
                  }}
                  className="mt-5 w-full rounded-2xl border border-zinc-300 bg-red-50 py-2.5 text-sm font-semibold text-red-500 transition-all duration-200 hover:-translate-y-0.5 hover:border-zinc-900 hover:bg-zinc-900 hover:text-white hover:shadow-[0_10px_24px_rgba(24,24,27,0.25)]"
                >
                  Оформить заказ
                </button>
              </article>
            </div>
          </section>
        ) : null}

        {isHomePage ? (
          <section className="mt-8 min-[640px]:mt-10">
            {IS_SOTIK_BRAND ? (
              <a
                href={SOTIK_AVITO_REVIEWS_HREF}
                target="_blank"
                rel="noopener noreferrer"
                className="group relative block w-full overflow-hidden rounded-3xl border border-[#6f89ff]/40 bg-[#10131f] p-5 text-white shadow-[0_14px_34px_rgba(0,0,0,0.25)] ring-1 ring-[#6f89ff]/20 transition hover:-translate-y-0.5 hover:shadow-[0_18px_40px_rgba(58,91,255,0.28)] min-[640px]:p-7"
              >
                <div className="relative z-10 mx-auto max-w-[38rem] text-center">
                  <p className="inline-flex rounded-full border border-[#6f89ff]/40 bg-[#6f89ff]/15 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-[#b8c8ff]">
                    Avito
                  </p>
                  <h3 className="mt-3 text-3xl font-bold leading-tight min-[640px]:text-5xl">Отзывы клиентов</h3>
                  <p className="mt-3 text-sm text-zinc-200/90 min-[640px]:text-lg">Более тысячи клиентов доверяют нам.</p>
                  <span className="mt-6 inline-flex rounded-2xl bg-gradient-to-r from-[#6f89ff] via-[#4c7dff] to-[#1f63ff] px-7 py-3 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(49,78,255,0.35)] transition group-hover:brightness-110 min-[640px]:mt-8 min-[640px]:px-10 min-[640px]:py-4">
                    Мы на Avito
                  </span>
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/avito.png"
                  alt=""
                  aria-hidden="true"
                  className="pointer-events-none absolute -right-6 -bottom-8 h-40 w-40 rotate-[-14deg] object-contain opacity-25 blur-[0.3px] transition duration-300 group-hover:opacity-35 min-[640px]:-right-8 min-[640px]:-bottom-10 min-[640px]:h-52 min-[640px]:w-52"
                />
                <div className="pointer-events-none absolute -left-12 top-1/2 h-44 w-44 -translate-y-1/2 rounded-full bg-[#00d19b]/20 blur-3xl" />
                <div className="pointer-events-none absolute right-0 top-0 h-52 w-52 rounded-full bg-[#6f89ff]/30 blur-3xl" />
                <div className="pointer-events-none absolute bottom-0 right-1/3 h-40 w-40 rounded-full bg-[#ff6f4b]/25 blur-3xl" />
              </a>
            ) : (
              <a
                href="https://2gis.ru"
                target="_blank"
                rel="noopener noreferrer"
                className="group relative block w-full overflow-hidden rounded-3xl border border-zinc-800 bg-[#121317] liquid-glass-dark p-5 text-white shadow-[0_14px_34px_rgba(0,0,0,0.22)] ring-1 ring-white/5 transition hover:-translate-y-0.5 hover:shadow-[0_18px_40px_rgba(0,0,0,0.3)] min-[640px]:p-7"
              >
                <div className="relative z-10 max-w-[38rem]">
                  <p className="text-xs font-semibold uppercase tracking-widest text-red-400">Нам доверяют</p>
                  <h3 className="mt-3 text-3xl font-bold leading-tight min-[640px]:text-5xl">Отзывы клиентов</h3>
                  <p className="mt-3 text-sm text-zinc-300 min-[640px]:text-lg">
                    Средняя оценка 5,0 на 2ГИС и более 100 отзывов подтверждают высокий уровень сервиса.
                  </p>
                  <span className="mt-6 inline-flex rounded-2xl bg-red-500 px-7 py-3 text-sm font-semibold text-white transition group-hover:bg-red-600 min-[640px]:mt-8 min-[640px]:px-10 min-[640px]:py-4">
                    Перейти в 2ГИС
                  </span>
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/test1.png"
                  alt="Отзывы в 2ГИС"
                  className="pointer-events-none absolute -right-8 -bottom-10 h-[135%] w-auto object-contain min-[640px]:right-0 min-[640px]:-bottom-16 min-[960px]:-bottom-12 min-[960px]:h-[145%]"
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/35 via-transparent to-transparent" />
              </a>
            )}

            {reviewPhotos.length ? (
              <div className="mt-4 overflow-hidden rounded-3xl border border-white/60 liquid-glass p-3 min-[640px]:mt-5 min-[640px]:p-4">
                <div className="mb-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                  <span />
                  <h4 className="text-center text-xl font-bold text-zinc-900 min-[640px]:text-2xl">Довольные клиенты</h4>
                  <p className="shrink-0 text-sm font-semibold text-zinc-500">
                    {reviewSlideIndex + 1} / {reviewPhotos.length}
                  </p>
                </div>

                <div className="relative rounded-2xl border border-white/70 bg-gradient-to-br from-white/85 via-red-50/55 to-zinc-100/85 px-11 py-5 shadow-inner">
                  <div className="block min-[640px]:grid min-[640px]:grid-cols-5 min-[640px]:items-center min-[640px]:gap-3">
                    {visibleReviewPhotos.map(({ photo, index, isCenter }) => (
                      <button
                        key={`${photo.id}-${index}`}
                        type="button"
                        className={`group relative overflow-hidden rounded-2xl transition-all duration-300 ${
                          isCenter
                            ? "block h-64 w-full shadow-[0_18px_36px_rgba(0,0,0,0.22)] ring-2 ring-red-500 min-[640px]:h-80 min-[640px]:scale-105"
                            : "hidden opacity-70 hover:opacity-95 min-[640px]:block min-[640px]:h-56"
                        }`}
                        onClick={() => setReviewSlideIndex(index)}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={photo.imageUrl}
                          alt={photo.title ?? SLIDER_PHOTO_ALT_FALLBACK}
                          loading="lazy"
                          decoding="async"
                          className="h-full w-full object-cover"
                        />
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    className="absolute left-3 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-xl font-semibold text-zinc-950 shadow-lg transition hover:bg-white"
                    aria-label="Предыдущее фото"
                    onClick={() => setReviewSlideIndex((index) => (index === 0 ? reviewPhotos.length - 1 : index - 1))}
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-xl font-semibold text-zinc-950 shadow-lg transition hover:bg-white"
                    aria-label="Следующее фото"
                    onClick={() => setReviewSlideIndex((index) => (index + 1) % reviewPhotos.length)}
                  >
                    ›
                  </button>
                </div>

                <div className="mt-3 flex justify-center gap-1.5">
                  {reviewPhotos.map((photo, index) => (
                    <button
                      key={photo.id}
                      type="button"
                      className={`h-2 rounded-full transition-all ${
                        reviewSlideIndex === index ? "w-7 bg-red-500" : "w-2 bg-zinc-300 hover:bg-zinc-400"
                      }`}
                      aria-label={`Показать фото ${index + 1}`}
                      onClick={() => setReviewSlideIndex(index)}
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        {!isHomePage ? (
          <section className="mt-8 min-[640px]:mt-10">
            <div className="mb-4 flex flex-col gap-2 min-[640px]:mb-5 min-[640px]:flex-row min-[640px]:items-center min-[640px]:justify-between">
              <h2 className="text-2xl font-bold text-zinc-900 min-[640px]:text-3xl min-[1920px]:text-4xl">
                {searchQuery.trim()
                  ? "Результаты поиска"
                  : activeCategory
                    ? `Товары: ${activeCategory.name}`
                    : "Все товары"}
              </h2>
              <input
                className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 outline-none transition focus:border-red-400 focus:ring-2 focus:ring-red-100 min-[640px]:w-80"
                placeholder="Поиск по товарам"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            {!storeFetched ? (
              <ProductGridSkeleton />
            ) : filteredProducts.length ? (
              <>
              <div className="grid grid-cols-2 gap-2 min-[640px]:grid-cols-2 min-[640px]:gap-3 min-[960px]:grid-cols-5 min-[1440px]:grid-cols-6 min-[1920px]:grid-cols-7 min-[1920px]:gap-4">
                {shownCatalogProducts.map((product, index) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    eager={index < CATALOG_PAGE_SIZE}
                    category={categoriesBySlug[product.categorySlug]}
                    onOrder={(selection) => {
                      setOrderSelection({
                        productName: product.name,
                        color: selection.color,
                        memory: selection.memory,
                        simType: selection.simType,
                        screen: selection.screen,
                        ram: selection.ram
                      });
                      setActiveModal("order");
                    }}
                    onAddToCart={(selection) => addToCart(product, selection)}
                    onOpenDetails={(selection) => {
                      const variants = effectiveVariantsForProduct(product, product.categorySlug);
                      const slug = product.categorySlug;
                      const isIphoneCategory = isIphoneLikeSlug(slug);
                      const isMacbookCategory = isMacbookLikeSlug(slug);
                      const isIpadCategory = isIpadLikeSlug(slug);
                      const isWatchCategory = isWatchLikeSlug(slug);
                      if (variants.length) {
                        setSelectedProductColor(selection.color ?? variants[0]?.color ?? "");
                        if (isIphoneCategory) {
                          setSelectedProductMemory(selection.memory ?? variants[0]?.memory ?? "");
                          setSelectedProductSim(selection.simType ?? variants[0]?.simType ?? "");
                          setSelectedProductScreen("");
                          setSelectedProductRam("");
                        } else if (isMacbookCategory) {
                          setSelectedProductMemory(selection.memory ?? variants[0]?.memory ?? "");
                          setSelectedProductScreen(selection.screen ?? variants[0]?.screen ?? "");
                          setSelectedProductRam(selection.ram ?? variants[0]?.ram ?? "");
                          setSelectedProductSim("");
                        } else if (isIpadCategory) {
                          setSelectedProductMemory(selection.memory ?? variants[0]?.memory ?? "");
                          setSelectedProductSim(selection.simType ?? variants[0]?.simType ?? "");
                          setSelectedProductScreen(selection.screen ?? variants[0]?.screen ?? "");
                          setSelectedProductRam("");
                        } else if (isWatchCategory) {
                          setSelectedProductMemory("");
                          setSelectedProductSim(selection.simType ?? variants[0]?.simType ?? "");
                          setSelectedProductScreen(selection.screen ?? variants[0]?.screen ?? "");
                          setSelectedProductRam("");
                        } else {
                          setSelectedProductMemory(selection.memory ?? variants[0]?.memory ?? "");
                          setSelectedProductSim("");
                          setSelectedProductScreen("");
                          setSelectedProductRam("");
                        }
                      } else {
                        setSelectedProductColor(selection.color ?? product.color ?? "");
                        setSelectedProductMemory("");
                        setSelectedProductSim("");
                        setSelectedProductScreen("");
                        setSelectedProductRam("");
                      }
                      setSelectedProduct(product);
                      setActiveModal("product");
                    }}
                  />
                ))}
              </div>
              {catalogVisibleCount < filteredProducts.length ? (
                <div className="mt-5 flex flex-col items-center gap-2">
                  <p className="text-sm text-zinc-500">
                    Показано {shownCatalogProducts.length} из {filteredProducts.length}
                  </p>
                  <button
                    type="button"
                    className="rounded-xl border border-zinc-300 bg-white px-5 py-2.5 text-sm font-semibold text-zinc-800 shadow-sm transition hover:border-zinc-400 hover:bg-zinc-50"
                    onClick={() => setCatalogVisibleCount((count) => count + CATALOG_PAGE_SIZE)}
                  >
                    Показать ещё
                  </button>
                </div>
              ) : null}
              </>
            ) : (
              <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-8 text-center text-zinc-500">
                По вашему запросу товары не найдены.
              </div>
            )}
          </section>
        ) : null}
          </>
        ) : null}
      </main>

      <footer className="mt-14 bg-[#111112] text-zinc-300">
        <div className="mx-auto flex w-full max-w-md flex-col items-center px-4 py-10 text-center min-[640px]:max-w-xl min-[960px]:max-w-5xl min-[960px]:py-14">
          <Link href="/" className="mb-8 inline-flex items-center text-2xl font-bold tracking-tight text-white min-[640px]:text-3xl">
            <BrandMark />
          </Link>

          <div className="w-full max-w-lg">
            <button
              type="button"
              className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-transparent px-4 py-3 text-left text-sm font-medium text-zinc-100 transition hover:border-white/20"
              aria-expanded={footerMenuOpen}
              onClick={() => setFooterMenuOpen((open) => !open)}
            >
              Меню
              <span className="inline-flex h-5 w-5 items-center justify-center" aria-hidden="true">
                <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4">
                  <path d="M5 7.5 10 12.5 15 7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </button>
            {footerMenuOpen ? (
              <div className="mt-3 space-y-1 text-left">
                {IS_SOTIK_BRAND ? (
                  <>
                    <Link href="/assessment" className="block rounded-lg px-4 py-2 text-sm text-zinc-300 hover:bg-white/5 hover:text-white">
                      Выкуп
                    </Link>
                    <button
                      type="button"
                      className="block w-full rounded-lg px-4 py-2 text-left text-sm text-zinc-300 hover:bg-white/5 hover:text-white"
                      onClick={() => setActiveModal("tradein")}
                    >
                      Trade-in
                    </button>
                    <Link href="/catalog" className="block rounded-lg px-4 py-2 text-sm text-zinc-300 hover:bg-white/5 hover:text-white">
                      Каталог
                    </Link>
                    <a
                      href={SOTIK_AVITO_REVIEWS_HREF}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block rounded-lg px-4 py-2 text-sm text-zinc-300 hover:bg-white/5 hover:text-white"
                    >
                      Отзывы
                    </a>
                  </>
                ) : (
                  <>
                    <Link href="/catalog" className="block rounded-lg px-4 py-2 text-sm text-zinc-300 hover:bg-white/5 hover:text-white">
                      Каталог
                    </Link>
                    <button
                      type="button"
                      className="block w-full rounded-lg px-4 py-2 text-left text-sm text-zinc-300 hover:bg-white/5 hover:text-white"
                      onClick={() => setActiveModal("tradein")}
                    >
                      Trade-in
                    </button>
                    <Link href="/assessment" className="block rounded-lg px-4 py-2 text-sm text-zinc-300 hover:bg-white/5 hover:text-white">
                      Выкуп
                    </Link>
                    <a
                      href="https://2gis.ru"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block rounded-lg px-4 py-2 text-sm text-zinc-300 hover:bg-white/5 hover:text-white"
                    >
                      Отзывы
                    </a>
                  </>
                )}
                <Link href="/info#delivery" className="block rounded-lg px-4 py-2 text-sm text-zinc-300 hover:bg-white/5 hover:text-white">
                  Доставка и оплата
                </Link>
                <Link href="/info#return" className="block rounded-lg px-4 py-2 text-sm text-zinc-300 hover:bg-white/5 hover:text-white">
                  Возврат и обмен
                </Link>
                <Link href="/info#warranty" className="block rounded-lg px-4 py-2 text-sm text-zinc-300 hover:bg-white/5 hover:text-white">
                  Гарантия и проверка
                </Link>
              </div>
            ) : null}
          </div>

          <div className="mt-10 flex w-full max-w-lg flex-wrap items-center justify-center gap-4">
            <a
              href={IS_SOTIK_BRAND ? SOTIK_PHONE_HREF : "tel:+79236969377"}
              className="inline-flex h-12 items-center gap-2 rounded-xl border border-white/10 px-4 text-sm font-semibold text-zinc-100"
            >
              <span aria-hidden="true">☎</span>
              {IS_SOTIK_BRAND ? SOTIK_PHONE_DISPLAY : "+7 (923) 696-93-77"}
            </a>
            {!IS_SOTIK_BRAND ? (
              <a href={VK_HREF} target="_blank" rel="noopener noreferrer" className="inline-flex h-12 w-12 items-center justify-center rounded-xl border border-white/10" aria-label="VK">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/icon/vk.svg" alt="" className="h-5 w-5" />
              </a>
            ) : null}
            <a
              href={IS_SOTIK_BRAND ? SOTIK_TELEGRAM_HREF : "https://t.me"}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-12 w-12 items-center justify-center rounded-xl border border-white/10"
              aria-label="Telegram"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icon/telegram.svg" alt="" className="h-5 w-5" />
            </a>
          </div>

          <div className="mt-4 flex w-full max-w-lg flex-col items-center justify-center gap-1 rounded-xl border border-white/10 px-4 py-3 text-sm text-zinc-300">
            <span className="inline-flex items-center gap-2">
              <span aria-hidden="true">⌖</span>
              {IS_SOTIK_BRAND ? SOTIK_HEADER_ADDRESS : "Омск, ул. Гагарина 3"}
            </span>
            {IS_SOTIK_BRAND ? (
              <span className="text-zinc-400">{SOTIK_HOURS_DETAIL}</span>
            ) : null}
          </div>

          <p className="mt-10 text-sm text-zinc-500">© 2026 Все права защищены.</p>
          <Link href="/policy" className="mt-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 hover:text-zinc-300">
            Политика конфиденциальности
          </Link>

          {showScrollTop ? (
            <button
              type="button"
              className="fixed bottom-5 right-5 z-40 inline-flex h-12 w-12 items-center justify-center rounded-full bg-red-500 text-xl font-semibold leading-none text-white shadow-[0_10px_28px_rgba(239,68,68,0.32)] transition hover:bg-red-600"
              aria-label="Наверх"
              onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            >
              ↑
            </button>
          ) : null}
        </div>
      </footer>

      <div
        className={`fixed inset-0 z-50 transition-opacity duration-300 min-[960px]:hidden ${
          IS_SOTIK_BRAND ? "bg-black/65" : "bg-black/40 backdrop-blur-sm"
        } ${mobileMenuOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}
      >
        <div
          className={`fixed right-0 top-0 h-full w-[86%] max-w-sm overflow-y-auto border-l px-5 py-5 transition-transform duration-300 ease-out min-[640px]:w-[82%] min-[640px]:px-7 min-[640px]:py-7 ${
            IS_SOTIK_BRAND
              ? "border-white/10 bg-[#111112] text-zinc-100 shadow-[0_24px_60px_rgba(0,0,0,0.55)]"
              : "border-zinc-200 bg-white text-zinc-900 shadow-[0_24px_64px_rgba(0,0,0,0.18)]"
          } ${mobileMenuOpen ? "translate-x-0" : "translate-x-full"}`}
        >
            <div className="mb-6 flex items-center justify-between min-[640px]:mb-8">
              <Link
                href="/"
                className={`text-3xl font-bold tracking-tight min-[640px]:text-4xl ${
                  IS_SOTIK_BRAND ? "text-white" : "text-zinc-950"
                }`}
                onClick={() => setMobileMenuOpen(false)}
              >
                <BrandMark />
              </Link>
              <button
                type="button"
                className={`relative inline-flex h-11 w-11 items-center justify-center rounded-full border transition ${
                  IS_SOTIK_BRAND
                    ? "border-white/10 bg-white/5 text-zinc-100 hover:border-white/20 hover:bg-white/10"
                    : "border-zinc-200 bg-zinc-50 text-zinc-900 hover:border-zinc-300 hover:bg-white"
                }`}
                aria-label="Закрыть меню"
                onClick={() => setMobileMenuOpen(false)}
              >
                <span className="absolute h-0.5 w-5 rotate-45 rounded-full bg-current" />
                <span className="absolute h-0.5 w-5 -rotate-45 rounded-full bg-current" />
              </button>
            </div>

            <div className="space-y-1.5">
              {IS_SOTIK_BRAND ? (
                <>
                  <Link
                    className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-lg font-semibold transition min-[640px]:text-xl ${
                      pathname === "/assessment"
                        ? "border-red-500/40 bg-red-500/15 text-red-300"
                        : "border-white/10 bg-white/[0.06] text-zinc-100 hover:border-white/20 hover:bg-white/10"
                    }`}
                    href="/assessment"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Выкуп
                    <span aria-hidden="true" className="text-zinc-500">›</span>
                  </Link>
                  <button
                    className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-left text-lg font-semibold text-zinc-100 transition hover:border-white/20 hover:bg-white/10 min-[640px]:text-xl"
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      setActiveModal("tradein");
                    }}
                  >
                    Trade-in
                    <span aria-hidden="true" className="text-zinc-500">›</span>
                  </button>
                  <Link
                    className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-lg font-semibold transition min-[640px]:text-xl ${
                      pathname === "/catalog"
                        ? "border-red-500/40 bg-red-500/15 text-red-300"
                        : "border-white/10 bg-white/[0.06] text-zinc-100 hover:border-white/20 hover:bg-white/10"
                    }`}
                    href="/catalog"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <span className="inline-flex items-center gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src="/icon/catalog.svg" alt="" aria-hidden="true" className="h-5.5 w-5.5 min-[640px]:h-6 min-[640px]:w-6" />
                      Каталог
                    </span>
                    <span aria-hidden="true" className="text-zinc-500">›</span>
                  </Link>
                </>
              ) : (
                <>
                  <Link
                    className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-lg font-semibold transition min-[640px]:text-xl ${
                      pathname === "/catalog"
                        ? "border-red-200 bg-red-50 text-red-600"
                        : "border-zinc-200 bg-zinc-50 text-zinc-900 hover:border-zinc-300 hover:bg-white"
                    }`}
                    href="/catalog"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <span className="inline-flex items-center gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src="/icon/catalog.svg" alt="" aria-hidden="true" className="h-5.5 w-5.5 min-[640px]:h-6 min-[640px]:w-6" />
                      Каталог
                    </span>
                    <span aria-hidden="true" className="text-zinc-400">›</span>
                  </Link>
                  <button
                    className="flex w-full items-center justify-between rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-left text-lg font-semibold text-zinc-900 transition hover:border-zinc-300 hover:bg-white min-[640px]:text-xl"
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      setActiveModal("tradein");
                    }}
                  >
                    Trade-in
                    <span aria-hidden="true" className="text-zinc-400">›</span>
                  </button>
                  <Link
                    className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-lg font-semibold transition min-[640px]:text-xl ${
                      pathname === "/assessment"
                        ? "border-red-200 bg-red-50 text-red-600"
                        : "border-zinc-200 bg-zinc-50 text-zinc-900 hover:border-zinc-300 hover:bg-white"
                    }`}
                    href="/assessment"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Выкуп
                    <span aria-hidden="true" className="text-zinc-400">›</span>
                  </Link>
                </>
              )}
              <button
                className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left text-lg font-semibold transition min-[640px]:text-xl ${
                  IS_SOTIK_BRAND
                    ? "border-white/10 bg-white/[0.06] text-zinc-100 hover:border-white/20 hover:bg-white/10"
                    : "border-zinc-200 bg-zinc-50 text-zinc-900 hover:border-zinc-300 hover:bg-white"
                }`}
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  setActiveModal("reviews");
                }}
              >
                Отзывы
                <span aria-hidden="true" className={IS_SOTIK_BRAND ? "text-zinc-500" : "text-zinc-400"}>›</span>
              </button>
              <a
                className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-lg font-semibold transition min-[640px]:text-xl ${
                  IS_SOTIK_BRAND
                    ? "border-white/10 bg-white/[0.06] text-zinc-100 hover:border-white/20 hover:bg-white/10"
                    : "border-zinc-200 bg-zinc-50 text-zinc-900 hover:border-zinc-300 hover:bg-white"
                }`}
                href="#"
              >
                Статьи
                <span aria-hidden="true" className={IS_SOTIK_BRAND ? "text-zinc-500" : "text-zinc-400"}>›</span>
              </a>
            </div>

            <div
              className={`mt-6 space-y-1 rounded-2xl border p-2 text-sm min-[640px]:text-base ${
                IS_SOTIK_BRAND
                  ? "border-white/10 bg-white/5 text-zinc-400"
                  : "border-zinc-200 bg-zinc-50 text-zinc-600"
              }`}
            >
              <Link
                href="/info#delivery"
                className={`block rounded-xl px-3 py-2 transition ${
                  IS_SOTIK_BRAND ? "hover:bg-white/10 hover:text-white" : "hover:bg-white hover:text-zinc-900"
                }`}
                onClick={() => setMobileMenuOpen(false)}
              >
                Доставка и оплата
              </Link>
              <Link
                href="/info#return"
                className={`block rounded-xl px-3 py-2 transition ${
                  IS_SOTIK_BRAND ? "hover:bg-white/10 hover:text-white" : "hover:bg-white hover:text-zinc-900"
                }`}
                onClick={() => setMobileMenuOpen(false)}
              >
                Возврат и обмен
              </Link>
              <Link
                href="/info#warranty"
                className={`block rounded-xl px-3 py-2 transition ${
                  IS_SOTIK_BRAND ? "hover:bg-white/10 hover:text-white" : "hover:bg-white hover:text-zinc-900"
                }`}
                onClick={() => setMobileMenuOpen(false)}
              >
                Гарантия и проверка
              </Link>
            </div>

            <a
              href={IS_SOTIK_BRAND ? SOTIK_PHONE_HREF : "tel:+79236969377"}
              className={`mt-6 flex items-center gap-3 rounded-2xl border px-4 py-3 transition ${
                IS_SOTIK_BRAND
                  ? "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10"
                  : "border-zinc-200 bg-zinc-50 hover:border-zinc-300 hover:bg-white"
              }`}
            >
              <span
                className={`inline-flex h-10 w-10 items-center justify-center rounded-full ring-1 ring-inset ${
                  IS_SOTIK_BRAND
                    ? "bg-red-500/15 text-red-400 ring-red-500/30"
                    : "bg-red-50 text-red-500 ring-red-200"
                }`}
              >
                <svg viewBox="0 0 20 20" aria-hidden="true" fill="currentColor" className="h-4 w-4">
                  <path d="M5.5 3a1.5 1.5 0 0 1 1.42 1.02l.7 2.07a1.5 1.5 0 0 1-.4 1.59l-1.04.97a11 11 0 0 0 4.17 4.17l.97-1.04a1.5 1.5 0 0 1 1.59-.4l2.07.7A1.5 1.5 0 0 1 17 13.5V16a1.5 1.5 0 0 1-1.5 1.5C8.6 17.5 2.5 11.4 2.5 4.5A1.5 1.5 0 0 1 4 3h1.5Z" />
                </svg>
              </span>
              <span className="flex flex-col leading-tight">
                <span
                  className={`text-lg font-semibold min-[640px]:text-xl ${
                    IS_SOTIK_BRAND ? "text-white" : "text-zinc-950"
                  }`}
                >
                  {IS_SOTIK_BRAND ? SOTIK_PHONE_DISPLAY : "+7 (923) 696-93-77"}
                </span>
                {IS_SOTIK_BRAND ? (
                  <span className="mt-1 text-sm font-semibold leading-snug text-zinc-400">{SOTIK_BUYBACK_NOTE}</span>
                ) : null}
                <span
                  className={`text-[11px] font-medium uppercase tracking-[0.12em] ${
                    IS_SOTIK_BRAND ? "mt-2 text-zinc-500" : "text-zinc-500"
                  }`}
                >
                  Позвонить
                </span>
              </span>
            </a>

            <div
              className={`mt-4 flex flex-col gap-2 rounded-2xl border px-4 py-3 text-sm ${
                IS_SOTIK_BRAND ? "border-white/10 bg-white/5" : "border-zinc-200 bg-zinc-50"
              }`}
            >
              {IS_SOTIK_BRAND ? (
                <>
                  <span className="inline-flex items-center gap-2 text-red-400">
                    <svg viewBox="0 0 20 20" aria-hidden="true" fill="currentColor" className="h-3.5 w-3.5">
                      <path d="M10 2a6 6 0 0 0-6 6c0 4.6 5.3 9.7 5.5 9.9a.7.7 0 0 0 1 0c.2-.2 5.5-5.3 5.5-9.9a6 6 0 0 0-6-6Zm0 8a2 2 0 1 1 0-4 2 2 0 0 1 0 4Z" />
                    </svg>
                    {SOTIK_HEADER_ADDRESS}
                  </span>
                  <span className="text-zinc-400">{SOTIK_HOURS_DETAIL}</span>
                </>
              ) : (
                <>
                  <span className="inline-flex items-center gap-2 text-red-600">
                    <svg viewBox="0 0 20 20" aria-hidden="true" fill="currentColor" className="h-3.5 w-3.5">
                      <path d="M10 2a6 6 0 0 0-6 6c0 4.6 5.3 9.7 5.5 9.9a.7.7 0 0 0 1 0c.2-.2 5.5-5.3 5.5-9.9a6 6 0 0 0-6-6Zm0 8a2 2 0 1 1 0-4 2 2 0 0 1 0 4Z" />
                    </svg>
                    Омск, ул. Гагарина 3
                  </span>
                  <span className="inline-flex items-center gap-2 text-emerald-700">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/70" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                    </span>
                    Сейчас открыто · 11:00–20:00
                  </span>
                  <span className="text-zinc-500">+7 (923) 686-93-77</span>
                </>
              )}
            </div>

            <div className="mt-6 flex gap-3 min-[640px]:mt-8 min-[640px]:gap-4">
              {!IS_SOTIK_BRAND ? (
                <a
                  href={VK_HREF}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-zinc-200 bg-zinc-50 transition hover:border-zinc-300 hover:bg-white min-[640px]:h-14 min-[640px]:w-14"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/icon/vk.svg" alt="VK" className="h-5.5 w-5.5 min-[640px]:h-6 min-[640px]:w-6" />
                </a>
              ) : null}
              <a
                href={IS_SOTIK_BRAND ? SOTIK_TELEGRAM_HREF : "https://t.me"}
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl border transition min-[640px]:h-14 min-[640px]:w-14 ${
                  IS_SOTIK_BRAND
                    ? "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10"
                    : "border-zinc-200 bg-zinc-50 hover:border-zinc-300 hover:bg-white"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/icon/telegram.svg" alt="Telegram" className="h-5.5 w-5.5 min-[640px]:h-6 min-[640px]:w-6" />
              </a>
            </div>
        </div>
      </div>

      {modal}

      {leadNotice ? (
        <div className="pointer-events-none fixed right-4 top-4 z-[60] w-[calc(100%-2rem)] max-w-sm min-[640px]:right-6 min-[640px]:top-6">
          <div
            className={`pointer-events-auto rounded-2xl border px-4 py-3 text-sm shadow-xl ${
              leadNotice.type === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : "border-red-200 bg-red-50 text-red-900"
            }`}
          >
            <div className="mb-1 flex items-center justify-between gap-3">
              <p className="font-semibold">{leadNotice.type === "success" ? "Заявка отправлена" : "Ошибка отправки"}</p>
              <button
                type="button"
                className="rounded-md px-1 text-base leading-none opacity-60 transition hover:opacity-100"
                onClick={() => setLeadNotice(null)}
                aria-label="Закрыть уведомление"
              >
                ×
              </button>
            </div>
            <p>{leadNotice.message}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}








