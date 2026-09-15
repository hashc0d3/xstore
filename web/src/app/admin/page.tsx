"use client";

import Link from "next/link";
import { ChangeEvent, DragEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { createCategory, deleteCategory, deleteProduct, fetchStoreData, fileToDataUrl, updateCategory, upsertProduct } from "@/lib/api";
import { Product, ProductVariant, StoreData, defaultStoreData, parseOptionalCompareAt, toRub } from "@/lib/store";

function createSlug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9а-яё]+/gi, "-")
    .replace(/^-+|-+$/g, "");
}

const IPHONE_LIKE_SLUGS = new Set(["iphone", "iphone-used"]);
const MACBOOK_LIKE_SLUGS = new Set(["macbook"]);
const IPAD_LIKE_SLUGS = new Set(["ipad"]);
const WATCH_LIKE_SLUGS = new Set(["apple-watch"]);

function isIphoneLikeCategory(slug: string): boolean {
  return IPHONE_LIKE_SLUGS.has(slug);
}

function isMacbookLikeCategory(slug: string): boolean {
  return MACBOOK_LIKE_SLUGS.has(slug);
}

function isIpadLikeCategory(slug: string): boolean {
  return IPAD_LIKE_SLUGS.has(slug);
}

function isWatchLikeCategory(slug: string): boolean {
  return WATCH_LIKE_SLUGS.has(slug);
}

/** Совпадает с защищёнными slug в API (ensureSeedData). */
const PROTECTED_CATEGORY_SLUGS = new Set([
  "iphone",
  "iphone-used",
  "macbook",
  "apple-watch",
  "ipad",
  "airpods",
  "custom"
]);

export default function AdminPage() {
  const [data, setData] = useState<StoreData>(defaultStoreData);
  const [categoryName, setCategoryName] = useState("");
  const [categoryImageUrl, setCategoryImageUrl] = useState("");
  const [categoryImageFileLabel, setCategoryImageFileLabel] = useState("");
  const [editCategoryId, setEditCategoryId] = useState("");
  const [editCategoryName, setEditCategoryName] = useState("");
  const [editCategoryImageUrl, setEditCategoryImageUrl] = useState("");
  const [editCategoryImageFileLabel, setEditCategoryImageFileLabel] = useState("");
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [productFormError, setProductFormError] = useState("");
  const [categoryActionError, setCategoryActionError] = useState("");
  const [productName, setProductName] = useState("");
  const [productDescription, setProductDescription] = useState("");
  const [productCategory, setProductCategory] = useState(defaultStoreData.categories[0]?.slug ?? "");
  const [newColorName, setNewColorName] = useState("");
  const [newMemoryOption, setNewMemoryOption] = useState("");
  const [newSimOption, setNewSimOption] = useState("");
  const [newScreenOption, setNewScreenOption] = useState("");
  const [newRamOption, setNewRamOption] = useState("");
  const [productColors, setProductColors] = useState<string[]>([]);
  const [productMemoryOptions, setProductMemoryOptions] = useState<string[]>([]);
  const [productSimOptions, setProductSimOptions] = useState<string[]>([]);
  const [productScreenOptions, setProductScreenOptions] = useState<string[]>([]);
  const [productRamOptions, setProductRamOptions] = useState<string[]>([]);
  const [productExistingImage, setProductExistingImage] = useState("");
  const [productColorImages, setProductColorImages] = useState<Record<string, string>>({});
  const [productColorImageNames, setProductColorImageNames] = useState<Record<string, string>>({});
  const [productVariants, setProductVariants] = useState<
    Array<{ color: string; memory: string; simType: string; screen: string; ram: string; price: string; compareAtPrice: string }>
  >([{ color: "", memory: "", simType: "", screen: "", ram: "", price: "", compareAtPrice: "" }]);

  const categories = data.categories;
  const products = data.products;
  const isIphoneCategory = isIphoneLikeCategory(productCategory);
  const isMacbookCategory = isMacbookLikeCategory(productCategory);
  const isIpadCategory = isIpadLikeCategory(productCategory);
  const isWatchCategory = isWatchLikeCategory(productCategory);
  const usesMemory = isIphoneCategory || isMacbookCategory || isIpadCategory;
  const usesSim = isIphoneCategory || isIpadCategory || isWatchCategory;
  const usesScreen = isMacbookCategory || isIpadCategory || isWatchCategory;
  const usesRam = isMacbookCategory;
  const screenSetTitle = isWatchCategory ? "Набор размеров корпуса" : "Набор диагоналей экрана";
  const screenPlaceholder = isWatchCategory
    ? "Добавить размер (например, 42 mm или 46 mm)"
    : 'Добавить диагональ (например, 11" или 13")';
  const simSetTitle = isWatchCategory
    ? "Набор ремешков"
    : isIpadCategory
      ? "Набор типов связи"
      : "Набор типов SIM";
  const simPlaceholder = isWatchCategory
    ? "Добавить ремешок (например, S/M или M/L)"
    : isIpadCategory
      ? "Добавить связь (например, Wi-Fi или Wi-Fi + Cellular)"
      : "Добавить тип SIM (например, eSIM + nano-SIM)";

  const productsByCategory = useMemo(() => {
    return categories.map((cat) => ({
      category: cat,
      items: products.filter((product) => product.categorySlug === cat.slug)
    }));
  }, [categories, products]);

  const syncStoreData = async () => {
    const remote = await fetchStoreData();
    setData(remote);
    setProductCategory((prev) => {
      if (prev && remote.categories.some((c) => c.slug === prev)) return prev;
      return remote.categories[0]?.slug ?? "";
    });
  };

  useEffect(() => {
    let isMounted = true;
    void fetchStoreData().then((remoteStore) => {
      if (!isMounted) return;
      setData(remoteStore);
      setProductCategory((prev) => {
        if (prev && remoteStore.categories.some((c) => c.slug === prev)) return prev;
        return remoteStore.categories[0]?.slug ?? "";
      });
    });
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (usesSim) return;
    setProductSimOptions([]);
    setNewSimOption("");
    setProductVariants((prev) => prev.map((item) => ({ ...item, simType: "" })));
  }, [usesSim]);

  useEffect(() => {
    if (usesMemory) return;
    setProductMemoryOptions([]);
    setNewMemoryOption("");
    setProductVariants((prev) => prev.map((item) => ({ ...item, memory: "" })));
  }, [usesMemory]);

  useEffect(() => {
    if (usesScreen) return;
    setProductScreenOptions([]);
    setNewScreenOption("");
    setProductVariants((prev) => prev.map((item) => ({ ...item, screen: "" })));
  }, [usesScreen]);

  useEffect(() => {
    if (usesRam) return;
    setProductRamOptions([]);
    setNewRamOption("");
    setProductVariants((prev) => prev.map((item) => ({ ...item, ram: "" })));
  }, [usesRam]);

  const onEditCategorySelect = (id: string) => {
    setEditCategoryId(id);
    setCategoryActionError("");
    if (!id) {
      setEditCategoryName("");
      setEditCategoryImageUrl("");
      setEditCategoryImageFileLabel("");
      return;
    }
    const cat = categories.find((c) => c.id === id);
    if (!cat) return;
    setEditCategoryName(cat.name);
    setEditCategoryImageUrl(cat.imageUrl ?? "");
    setEditCategoryImageFileLabel("");
  };

  const onEditCategorySubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!editCategoryId) return;
    const name = editCategoryName.trim();
    if (!name) {
      setCategoryActionError("Укажите название категории.");
      return;
    }
    setCategoryActionError("");
    void updateCategory(editCategoryId, {
      name,
      imageUrl: editCategoryImageUrl.trim()
    })
      .then(syncStoreData)
      .catch(() => {
        setCategoryActionError("Не удалось сохранить категорию. Проверьте API.");
      });
  };

  const onCategorySubmit = (e: FormEvent) => {
    e.preventDefault();
    const name = categoryName.trim();
    if (!name) return;

    setCategoryActionError("");
    const slug = createSlug(name);
    if (!slug) return;
    if (categories.some((item) => item.slug === slug)) return;

    void createCategory({
      name,
      imageUrl: categoryImageUrl.trim() || undefined
    }).then(syncStoreData);
    setCategoryName("");
    setCategoryImageUrl("");
    setCategoryImageFileLabel("");
    setProductCategory((prev) => prev || slug);
  };

  const mapVariantsToForm = (variants?: ProductVariant[]) => {
    if (!variants?.length) {
      return [{ color: "", memory: "", simType: "", screen: "", ram: "", price: "", compareAtPrice: "" }];
    }
    return variants.map((variant) => ({
      color: variant.color ?? "",
      memory: variant.memory ?? "",
      simType: variant.simType ?? "",
      screen: variant.screen ?? "",
      ram: variant.ram ?? "",
      price: String(variant.price),
      compareAtPrice: variant.compareAtPrice ? String(variant.compareAtPrice) : ""
    }));
  };

  const addVariantRow = () => {
    setProductVariants((prev) => [
      ...prev,
      {
        color: productColors[0] ?? "",
        memory: usesMemory ? (productMemoryOptions[0] ?? "") : "",
        simType: usesSim ? (productSimOptions[0] ?? "") : "",
        screen: usesScreen ? (productScreenOptions[0] ?? "") : "",
        ram: usesRam ? (productRamOptions[0] ?? "") : "",
        price: "",
        compareAtPrice: ""
      }
    ]);
  };

  const removeVariantRow = (index: number) => {
    setProductVariants((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((_, idx) => idx !== index);
    });
  };

  const updateVariantRow = (
    index: number,
    patch: Partial<{
      color: string;
      memory: string;
      simType: string;
      screen: string;
      ram: string;
      price: string;
      compareAtPrice: string;
    }>
  ) => {
    setProductVariants((prev) => prev.map((row, idx) => (idx === index ? { ...row, ...patch } : row)));
  };

  const saveColorImage = async (color: string, file: File) => {
    try {
      const dataUrl = await fileToDataUrl(file);
      setProductColorImages((prev) => ({ ...prev, [color]: dataUrl }));
      setProductColorImageNames((prev) => ({ ...prev, [color]: file.name }));
    } catch {
      // Ignore image read errors and keep previous value.
    }
  };

  const addProductColor = () => {
    const color = newColorName.trim();
    if (!color) return;
    if (productColors.includes(color)) {
      setNewColorName("");
      return;
    }
    setProductColors((prev) => [...prev, color]);
    setProductVariants((prev) =>
      prev.map((item, index) => (index === 0 && !item.color ? { ...item, color } : item))
    );
    setNewColorName("");
  };

  const addProductMemoryOption = () => {
    const option = newMemoryOption.trim();
    if (!option) return;
    if (productMemoryOptions.includes(option)) {
      setNewMemoryOption("");
      return;
    }
    setProductMemoryOptions((prev) => [...prev, option]);
    setProductVariants((prev) =>
      prev.map((item, index) => (index === 0 && !item.memory ? { ...item, memory: option } : item))
    );
    setNewMemoryOption("");
  };

  const addProductSimOption = () => {
    const option = newSimOption.trim();
    if (!option) return;
    if (productSimOptions.includes(option)) {
      setNewSimOption("");
      return;
    }
    setProductSimOptions((prev) => [...prev, option]);
    setProductVariants((prev) =>
      prev.map((item, index) => (index === 0 && !item.simType ? { ...item, simType: option } : item))
    );
    setNewSimOption("");
  };

  const addProductScreenOption = () => {
    const option = newScreenOption.trim();
    if (!option) return;
    if (productScreenOptions.includes(option)) {
      setNewScreenOption("");
      return;
    }
    setProductScreenOptions((prev) => [...prev, option]);
    setProductVariants((prev) =>
      prev.map((item, index) => (index === 0 && !item.screen ? { ...item, screen: option } : item))
    );
    setNewScreenOption("");
  };

  const addProductRamOption = () => {
    const option = newRamOption.trim();
    if (!option) return;
    if (productRamOptions.includes(option)) {
      setNewRamOption("");
      return;
    }
    setProductRamOptions((prev) => [...prev, option]);
    setProductVariants((prev) =>
      prev.map((item, index) => (index === 0 && !item.ram ? { ...item, ram: option } : item))
    );
    setNewRamOption("");
  };

  const removeProductColor = (colorToRemove: string) => {
    const nextColors = productColors.filter((color) => color !== colorToRemove);
    setProductColors(nextColors);
    setProductColorImages((prev) => {
      if (!prev[colorToRemove]) return prev;
      const copy = { ...prev };
      delete copy[colorToRemove];
      return copy;
    });
    setProductColorImageNames((prev) => {
      if (!prev[colorToRemove]) return prev;
      const copy = { ...prev };
      delete copy[colorToRemove];
      return copy;
    });
    setProductVariants((prev) =>
      prev.map((variant) => {
        if (variant.color !== colorToRemove) return variant;
        return { ...variant, color: nextColors[0] ?? "" };
      })
    );
  };

  const removeProductMemoryOption = (optionToRemove: string) => {
    const nextOptions = productMemoryOptions.filter((option) => option !== optionToRemove);
    setProductMemoryOptions(nextOptions);
    setProductVariants((prev) =>
      prev.map((variant) => {
        if (variant.memory !== optionToRemove) return variant;
        return { ...variant, memory: nextOptions[0] ?? "" };
      })
    );
  };

  const removeProductSimOption = (optionToRemove: string) => {
    const nextOptions = productSimOptions.filter((option) => option !== optionToRemove);
    setProductSimOptions(nextOptions);
    setProductVariants((prev) =>
      prev.map((variant) => {
        if (variant.simType !== optionToRemove) return variant;
        return { ...variant, simType: nextOptions[0] ?? "" };
      })
    );
  };

  const removeProductScreenOption = (optionToRemove: string) => {
    const nextOptions = productScreenOptions.filter((option) => option !== optionToRemove);
    setProductScreenOptions(nextOptions);
    setProductVariants((prev) =>
      prev.map((variant) => {
        if (variant.screen !== optionToRemove) return variant;
        return { ...variant, screen: nextOptions[0] ?? "" };
      })
    );
  };

  const removeProductRamOption = (optionToRemove: string) => {
    const nextOptions = productRamOptions.filter((option) => option !== optionToRemove);
    setProductRamOptions(nextOptions);
    setProductVariants((prev) =>
      prev.map((variant) => {
        if (variant.ram !== optionToRemove) return variant;
        return { ...variant, ram: nextOptions[0] ?? "" };
      })
    );
  };

  const onColorImageInputChange =
    (color: string) =>
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      void saveColorImage(color, file);
    };

  const onColorImageDrop =
    (color: string) =>
    (e: DragEvent<HTMLLabelElement>) => {
      e.preventDefault();
      const file = e.dataTransfer.files?.[0];
      if (!file) return;
      void saveColorImage(color, file);
    };

  const resetProductForm = () => {
    setEditingProductId(null);
    setProductFormError("");
    setProductName("");
    setProductDescription("");
    setNewColorName("");
    setNewMemoryOption("");
    setNewSimOption("");
    setNewScreenOption("");
    setNewRamOption("");
    setProductColors([]);
    setProductMemoryOptions([]);
    setProductSimOptions([]);
    setProductScreenOptions([]);
    setProductRamOptions([]);
    setProductExistingImage("");
    setProductColorImages({});
    setProductColorImageNames({});
    setProductVariants([{ color: "", memory: "", simType: "", screen: "", ram: "", price: "", compareAtPrice: "" }]);
  };

  const startEditProduct = (product: Product) => {
    setEditingProductId(product.id);
    setProductFormError("");
    setProductName(product.name);
    setProductDescription(product.description ?? "");
    setProductCategory(product.categorySlug);
    setNewColorName("");
    setNewMemoryOption("");
    setNewSimOption("");
    setNewScreenOption("");
    setNewRamOption("");
    setProductExistingImage(product.imageUrl);
    setProductVariants(
      mapVariantsToForm(
        product.variants?.length
          ? product.variants
          : [
              {
                color: product.color,
                price: product.basePrice,
                compareAtPrice: product.compareAtPrice,
                imageUrl: product.imageUrl
              }
            ]
      )
    );
    const colorImages: Record<string, string> = {};
    const colorImageNames: Record<string, string> = {};
    for (const variant of product.variants ?? []) {
      const color = variant.color?.trim();
      const image = variant.imageUrl?.trim();
      if (!color || !image || colorImages[color]) continue;
      colorImages[color] = image;
      colorImageNames[color] = "Загружено ранее";
    }
    if (product.color && !colorImages[product.color] && product.imageUrl) {
      colorImages[product.color] = product.imageUrl;
      colorImageNames[product.color] = "Текущее изображение товара";
    }
    const colors = Array.from(
      new Set(
        (product.variants?.length
          ? product.variants.map((item) => item.color ?? "")
          : [product.color ?? ""])
          .map((item) => item.trim())
          .filter(Boolean)
      )
    );
    const memoryOptions = Array.from(
      new Set((product.variants ?? []).map((item) => (item.memory ?? "").trim()).filter(Boolean))
    );
    const simOptions = Array.from(
      new Set((product.variants ?? []).map((item) => (item.simType ?? "").trim()).filter(Boolean))
    );
    const screenOptions = Array.from(
      new Set((product.variants ?? []).map((item) => (item.screen ?? "").trim()).filter(Boolean))
    );
    const ramOptions = Array.from(
      new Set((product.variants ?? []).map((item) => (item.ram ?? "").trim()).filter(Boolean))
    );
    setProductColors(colors);
    setProductMemoryOptions(memoryOptions);
    setProductSimOptions(simOptions);
    setProductScreenOptions(screenOptions);
    setProductRamOptions(ramOptions);
    setProductColorImages(colorImages);
    setProductColorImageNames(colorImageNames);
  };

  const onProductSubmit = (e: FormEvent) => {
    e.preventDefault();
    setProductFormError("");
    const name = productName.trim();
    const description = productDescription.trim();
    const categorySlug = productCategory;
    const defaultImageUrl =
      productExistingImage.trim() ||
      "/image.png";
    const variants: Array<{
      color?: string;
      memory?: string;
      simType?: string;
      screen?: string;
      ram?: string;
      price: number;
      compareAtPrice?: number;
      imageUrl?: string;
    }> = [];
    for (const item of productVariants) {
      const price = Number(item.price);
      if (Number.isNaN(price)) continue;
      const color = item.color.trim();
      const colorImage = color ? productColorImages[color] : undefined;
      const compareAtPrice = parseOptionalCompareAt(item.compareAtPrice);
      variants.push({
        color: color || undefined,
        memory: usesMemory ? (item.memory.trim() || undefined) : undefined,
        simType: usesSim ? (item.simType.trim() || undefined) : undefined,
        screen: usesScreen ? (item.screen.trim() || undefined) : undefined,
        ram: usesRam ? (item.ram.trim() || undefined) : undefined,
        price,
        ...(compareAtPrice ? { compareAtPrice } : {}),
        imageUrl: colorImage || defaultImageUrl
      });
    }
    const basePrice = variants.length
      ? Math.min(...variants.map((item) => item.price))
      : Number.NaN;
    const imageUrl = variants[0]?.imageUrl ?? defaultImageUrl;
    const requiredColors = productColors.map((item) => item.trim()).filter(Boolean);
    const missingColorImages = requiredColors.filter((color) => !productColorImages[color] && !productExistingImage.trim());
    const hasVariantWithoutColor = productVariants.some((item) => Boolean(item.price.trim()) && !item.color.trim());
    const hasVariantWithoutMemory =
      usesMemory && productMemoryOptions.length
        ? productVariants.some((item) => Boolean(item.price.trim()) && !item.memory.trim())
        : false;
    const hasVariantWithoutSim =
      usesSim && productSimOptions.length
        ? productVariants.some((item) => Boolean(item.price.trim()) && !item.simType.trim())
        : false;
    const hasVariantWithoutScreen =
      usesScreen && productScreenOptions.length
        ? productVariants.some((item) => Boolean(item.price.trim()) && !item.screen.trim())
        : false;
    const hasVariantWithoutRam =
      usesRam && productRamOptions.length
        ? productVariants.some((item) => Boolean(item.price.trim()) && !item.ram.trim())
        : false;

    if (!name || !categorySlug || Number.isNaN(basePrice)) {
      setProductFormError("Заполните название, категорию и цену хотя бы у одного варианта.");
      return;
    }
    if (!requiredColors.length) {
      setProductFormError("Сначала добавьте хотя бы один цвет товара.");
      return;
    }
    if (hasVariantWithoutColor) {
      setProductFormError("Укажите цвет для каждого варианта с ценой.");
      return;
    }
    if (hasVariantWithoutMemory) {
      setProductFormError(
        isIpadCategory || isMacbookCategory
          ? "Укажите накопитель для каждого варианта с ценой."
          : "Укажите объем памяти для каждого варианта с ценой."
      );
      return;
    }
    if (hasVariantWithoutSim) {
      setProductFormError(
        isWatchCategory
          ? "Укажите ремешок для каждого варианта с ценой."
          : isIpadCategory
            ? "Укажите тип связи для каждого варианта с ценой."
            : "Укажите тип SIM для каждого варианта с ценой."
      );
      return;
    }
    if (hasVariantWithoutScreen) {
      setProductFormError(
        isWatchCategory
          ? "Укажите размер корпуса для каждого варианта с ценой."
          : "Укажите диагональ для каждого варианта с ценой."
      );
      return;
    }
    if (hasVariantWithoutRam) {
      setProductFormError("Укажите оперативную память для каждого варианта с ценой.");
      return;
    }
    if (missingColorImages.length) {
      setProductFormError(`Загрузите фото для цветов: ${missingColorImages.join(", ")}.`);
      return;
    }

    void upsertProduct({
      id: editingProductId ?? undefined,
      name,
      color: variants[0]?.color,
      description: description || undefined,
      categorySlug,
      basePrice,
      variants: variants.length ? variants : undefined,
      imageUrl
    }).then(syncStoreData);

    resetProductForm();
  };

  const removeProduct = (id: string) => {
    void deleteProduct(id)
      .then(syncStoreData)
      .catch(() => {
        setProductFormError("Не удалось удалить товар. Проверьте, что API запущен и попробуйте еще раз.");
      });
  };

  const removeCategory = (id: string, name: string, slug: string) => {
    if (PROTECTED_CATEGORY_SLUGS.has(slug)) return;
    if (!window.confirm(`Удалить категорию «${name}» и все товары в ней? Это действие необратимо.`)) return;
    setCategoryActionError("");
    void deleteCategory(id)
      .then(syncStoreData)
      .catch(() => {
        setCategoryActionError("Не удалось удалить категорию. Проверьте API или права.");
      });
  };

  return (
    <div className="min-h-screen bg-zinc-100 px-6 py-8 text-zinc-900">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Админка X:STORE</h1>
            <p className="text-sm text-zinc-500">Категории и товары витрины</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/admin/slider" className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700">
              Слайдер
            </Link>
            <Link href="/admin/buyback" className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700">
              Выкуп
            </Link>
            <Link href="/" className="rounded-xl bg-zinc-900 px-4 py-2 text-white">
              На сайт
            </Link>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-4">
          <section className="rounded-2xl bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-xl font-semibold">Добавить категорию</h2>
            <form onSubmit={onCategorySubmit} className="space-y-3">
              <input
                className="field"
                placeholder="Название категории (например, Dyson)"
                value={categoryName}
                onChange={(e) => setCategoryName(e.target.value)}
              />
              <input
                className="field"
                placeholder="Картинка категории — URL (https://… или /file.png)"
                value={categoryImageUrl.startsWith("data:") ? "" : categoryImageUrl}
                onChange={(e) => {
                  setCategoryImageUrl(e.target.value);
                  setCategoryImageFileLabel("");
                }}
              />
              <label className="block cursor-pointer rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-3 py-3 text-sm text-zinc-600 transition hover:border-zinc-400">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      const dataUrl = await fileToDataUrl(file);
                      setCategoryImageUrl(dataUrl);
                      setCategoryImageFileLabel(file.name);
                    } catch {
                      // ignore
                    }
                    e.target.value = "";
                  }}
                />
                Или загрузить файл: {categoryImageFileLabel || "нажмите для выбора"}
              </label>
              {categoryImageUrl.startsWith("data:") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={categoryImageUrl} alt="" className="h-20 w-20 rounded-lg border border-zinc-200 object-cover" />
              ) : null}
              <button type="submit" className="btn-primary">
                Сохранить категорию
              </button>
            </form>
          </section>

          <section className="rounded-2xl bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-xl font-semibold">Редактировать категорию</h2>
            <p className="mb-3 text-sm text-zinc-500">
              Название и фото на витрине (slug и URL раздела не меняются).
            </p>
            <form onSubmit={onEditCategorySubmit} className="space-y-3">
              <select
                className="field"
                value={editCategoryId}
                onChange={(e) => onEditCategorySelect(e.target.value)}
              >
                <option value="">Выберите категорию…</option>
                {categories.map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.name} ({item.slug})
                  </option>
                ))}
              </select>
              <input
                className="field"
                placeholder="Название"
                value={editCategoryName}
                onChange={(e) => setEditCategoryName(e.target.value)}
                disabled={!editCategoryId}
              />
              <input
                className="field"
                placeholder="Фото категории — URL или data URL после загрузки файла"
                value={editCategoryImageUrl.startsWith("data:") ? "" : editCategoryImageUrl}
                onChange={(e) => {
                  setEditCategoryImageUrl(e.target.value);
                  setEditCategoryImageFileLabel("");
                }}
                disabled={!editCategoryId}
              />
              <label
                className={`block cursor-pointer rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-3 py-3 text-sm text-zinc-600 transition hover:border-zinc-400 ${
                  !editCategoryId ? "pointer-events-none opacity-50" : ""
                }`}
              >
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={!editCategoryId}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      const dataUrl = await fileToDataUrl(file);
                      setEditCategoryImageUrl(dataUrl);
                      setEditCategoryImageFileLabel(file.name);
                    } catch {
                      // ignore
                    }
                    e.target.value = "";
                  }}
                />
                Загрузить файл: {editCategoryImageFileLabel || "нажмите для выбора"}
              </label>
              {editCategoryImageUrl && editCategoryImageUrl.startsWith("data:") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={editCategoryImageUrl} alt="" className="h-20 w-20 rounded-lg border border-zinc-200 object-cover" />
              ) : editCategoryImageUrl && !editCategoryImageUrl.startsWith("data:") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={editCategoryImageUrl} alt="" className="h-20 w-20 rounded-lg border border-zinc-200 object-cover" />
              ) : null}
              <button type="submit" className="btn-primary" disabled={!editCategoryId}>
                Сохранить изменения
              </button>
            </form>
          </section>
          </div>

          {categoryActionError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 lg:col-span-2">
              {categoryActionError}
            </div>
          ) : null}

          <section className="rounded-2xl bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-xl font-semibold">Добавить товар</h2>
            <form onSubmit={onProductSubmit} className="space-y-3">
              <input
                className="field"
                placeholder="Название товара"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
              />
              <textarea
                className="field min-h-24 resize-y"
                placeholder="Полное описание товара"
                value={productDescription}
                onChange={(e) => setProductDescription(e.target.value)}
              />
              <select className="field" value={productCategory} onChange={(e) => setProductCategory(e.target.value)}>
                {categories.map((item) => (
                  <option value={item.slug} key={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <div className="space-y-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                <p className="text-sm font-semibold text-zinc-800">Цвета товара</p>
                <div className="flex gap-2">
                  <input
                    className="field"
                    placeholder="Добавить цвет (например, Natural Titanium)"
                    value={newColorName}
                    onChange={(e) => setNewColorName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addProductColor();
                      }
                    }}
                  />
                  <button type="button" className="rounded-lg border border-zinc-300 px-3 py-2 text-sm" onClick={addProductColor}>
                    Добавить
                  </button>
                </div>
                {productColors.length ? (
                  <div className="space-y-2">
                    {productColors.map((color) => (
                      <div key={color} className="rounded-lg border border-zinc-200 bg-white p-2.5">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <p className="text-sm font-medium text-zinc-800">{color}</p>
                          <button
                            type="button"
                            className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-600"
                            onClick={() => removeProductColor(color)}
                          >
                            Удалить цвет
                          </button>
                        </div>
                        <label
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={onColorImageDrop(color)}
                          className="block cursor-pointer rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-3 transition hover:border-zinc-400"
                        >
                          <input type="file" accept="image/*" className="hidden" onChange={onColorImageInputChange(color)} />
                          <p className="text-xs text-zinc-600">Перетащите фото сюда или нажмите для выбора</p>
                          <p className="mt-1 text-xs text-zinc-500">
                            {productColorImageNames[color] ? `Файл: ${productColorImageNames[color]}` : "Файл не выбран"}
                          </p>
                          {productColorImages[color] ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={productColorImages[color]}
                              alt={`Фото цвета ${color}`}
                              className="mt-2 h-16 w-16 rounded-md border border-zinc-200 object-cover"
                            />
                          ) : null}
                        </label>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-zinc-500">Сначала добавьте цвета, затем загрузите фото для каждого цвета.</p>
                )}
              </div>
              {usesMemory ? (
                <div className="space-y-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                  <p className="text-sm font-semibold text-zinc-800">
                    {isIphoneCategory ? "Набор объемов памяти" : "Набор объемов накопителя"}
                  </p>
                  <div className="flex gap-2">
                    <input
                      className="field"
                      placeholder={
                        isIphoneCategory
                          ? "Добавить объем (например, 256 ГБ)"
                          : "Добавить объем (например, 256 ГБ или 1 ТБ)"
                      }
                      value={newMemoryOption}
                      onChange={(e) => setNewMemoryOption(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addProductMemoryOption();
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                      onClick={addProductMemoryOption}
                    >
                      Добавить
                    </button>
                  </div>
                  {productMemoryOptions.length ? (
                    <div className="flex flex-wrap gap-2">
                      {productMemoryOptions.map((option) => (
                        <button
                          key={option}
                          type="button"
                          className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700"
                          onClick={() => removeProductMemoryOption(option)}
                          title="Удалить объем"
                        >
                          {option} ×
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-zinc-500">
                      {isIphoneCategory
                        ? "Добавьте объемы памяти, которые будут доступны в вариантах."
                        : "Добавьте объемы накопителя, которые будут доступны в вариантах."}
                    </p>
                  )}
                </div>
              ) : null}
              {usesSim ? (
                <div className="space-y-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                  <p className="text-sm font-semibold text-zinc-800">{simSetTitle}</p>
                  <div className="flex gap-2">
                    <input
                      className="field"
                      placeholder={simPlaceholder}
                      value={newSimOption}
                      onChange={(e) => setNewSimOption(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addProductSimOption();
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                      onClick={addProductSimOption}
                    >
                      Добавить
                    </button>
                  </div>
                  {productSimOptions.length ? (
                    <div className="flex flex-wrap gap-2">
                      {productSimOptions.map((option) => (
                        <button
                          key={option}
                          type="button"
                          className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700"
                          onClick={() => removeProductSimOption(option)}
                          title={
                            isWatchCategory
                              ? "Удалить ремешок"
                              : isIpadCategory
                                ? "Удалить тип связи"
                                : "Удалить тип SIM"
                          }
                        >
                          {option} ×
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-zinc-500">
                      {isWatchCategory
                        ? "Добавьте ремешки, которые будут доступны в вариантах."
                        : isIpadCategory
                          ? "Добавьте типы связи, которые будут доступны в вариантах."
                          : "Добавьте типы SIM, которые будут доступны в вариантах."}
                    </p>
                  )}
                </div>
              ) : null}
              {usesScreen ? (
                <div className="space-y-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                  <p className="text-sm font-semibold text-zinc-800">{screenSetTitle}</p>
                  <div className="flex gap-2">
                    <input
                      className="field"
                      placeholder={screenPlaceholder}
                      value={newScreenOption}
                      onChange={(e) => setNewScreenOption(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addProductScreenOption();
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                      onClick={addProductScreenOption}
                    >
                      Добавить
                    </button>
                  </div>
                  {productScreenOptions.length ? (
                    <div className="flex flex-wrap gap-2">
                      {productScreenOptions.map((option) => (
                        <button
                          key={option}
                          type="button"
                          className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700"
                          onClick={() => removeProductScreenOption(option)}
                          title={isWatchCategory ? "Удалить размер корпуса" : "Удалить диагональ"}
                        >
                          {option} ×
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-zinc-500">
                      {isWatchCategory
                        ? "Добавьте размеры корпуса, которые будут доступны в вариантах."
                        : "Добавьте диагонали, которые будут доступны в вариантах."}
                    </p>
                  )}
                </div>
              ) : null}
              {usesRam ? (
                <div className="space-y-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                  <p className="text-sm font-semibold text-zinc-800">Набор объемов оперативной памяти</p>
                  <div className="flex gap-2">
                    <input
                      className="field"
                      placeholder="Добавить RAM (например, 16GB или 24GB)"
                      value={newRamOption}
                      onChange={(e) => setNewRamOption(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addProductRamOption();
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                      onClick={addProductRamOption}
                    >
                      Добавить
                    </button>
                  </div>
                  {productRamOptions.length ? (
                    <div className="flex flex-wrap gap-2">
                      {productRamOptions.map((option) => (
                        <button
                          key={option}
                          type="button"
                          className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700"
                          onClick={() => removeProductRamOption(option)}
                          title="Удалить RAM"
                        >
                          {option} ×
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-zinc-500">Добавьте объемы RAM, которые будут доступны в вариантах.</p>
                  )}
                </div>
              ) : null}
              <div className="space-y-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-zinc-800">Варианты товара</p>
                  <button type="button" className="rounded-lg border border-zinc-300 px-2 py-1 text-xs" onClick={addVariantRow}>
                    + Добавить вариант
                  </button>
                </div>
                {productVariants.map((variant, index) => (
                  <div key={index} className="space-y-2 rounded-lg border border-zinc-200 bg-white p-2.5">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <select
                        className="field"
                        value={variant.color}
                        onChange={(e) => updateVariantRow(index, { color: e.target.value })}
                        disabled={!productColors.length}
                      >
                        <option value="">{productColors.length ? "Выберите цвет" : "Сначала добавьте цвета"}</option>
                        {productColors.map((color) => (
                          <option key={color} value={color}>
                            {color}
                          </option>
                        ))}
                      </select>
                      {usesScreen ? (
                        <select
                          className="field"
                          value={variant.screen}
                          disabled={!productScreenOptions.length}
                          onChange={(e) => updateVariantRow(index, { screen: e.target.value })}
                        >
                          <option value="">
                            {productScreenOptions.length
                              ? isWatchCategory
                                ? "Выберите размер корпуса"
                                : "Выберите диагональ"
                              : isWatchCategory
                                ? "Сначала добавьте размеры корпуса"
                                : "Сначала добавьте диагонали"}
                          </option>
                          {productScreenOptions.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      ) : null}
                      {usesMemory ? (
                        <select
                          className="field"
                          value={variant.memory}
                          disabled={!productMemoryOptions.length}
                          onChange={(e) => updateVariantRow(index, { memory: e.target.value })}
                        >
                          <option value="">
                            {productMemoryOptions.length
                              ? isIphoneCategory
                                ? "Выберите объем памяти"
                                : "Выберите накопитель"
                              : "Сначала добавьте объемы"}
                          </option>
                          {productMemoryOptions.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      ) : null}
                      {usesRam ? (
                        <select
                          className="field"
                          value={variant.ram}
                          disabled={!productRamOptions.length}
                          onChange={(e) => updateVariantRow(index, { ram: e.target.value })}
                        >
                          <option value="">{productRamOptions.length ? "Выберите RAM" : "Сначала добавьте RAM"}</option>
                          {productRamOptions.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      ) : null}
                      {usesSim ? (
                        <select
                          className="field"
                          value={variant.simType}
                          disabled={!productSimOptions.length}
                          onChange={(e) => updateVariantRow(index, { simType: e.target.value })}
                        >
                          <option value="">
                            {productSimOptions.length
                              ? isWatchCategory
                                ? "Выберите ремешок"
                                : isIpadCategory
                                  ? "Выберите тип связи"
                                  : "Выберите тип SIM"
                              : isWatchCategory
                                ? "Сначала добавьте ремешки"
                                : isIpadCategory
                                  ? "Сначала добавьте типы связи"
                                  : "Сначала добавьте типы SIM"}
                          </option>
                          {productSimOptions.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      ) : null}
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-zinc-600">
                          Цена варианта <span className="text-red-500">*</span>
                        </label>
                        <input
                          className="field"
                          type="number"
                          min={0}
                          step={1}
                          required
                          placeholder="Цена варианта *"
                          value={variant.price}
                          onChange={(e) => updateVariantRow(index, { price: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-zinc-500">
                          Старая цена
                        </label>
                        <input
                          className="field"
                          type="number"
                          min={1}
                          step={1}
                          placeholder="Старая цена (необязательно)"
                          value={variant.compareAtPrice}
                          onChange={(e) => updateVariantRow(index, { compareAtPrice: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <button
                        type="button"
                        className="rounded-lg border border-red-200 px-2 py-1 text-xs text-red-600 disabled:opacity-50"
                        onClick={() => removeVariantRow(index)}
                        disabled={productVariants.length <= 1}
                      >
                        Удалить вариант
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-zinc-500">
                Для iPhone и iPhone Б/У: цвета + фото + наборы памяти и SIM. Для iPad: цвета + фото + диагональ, накопитель и связь. Для Apple Watch: цвета + фото + размер корпуса и ремешок. Для MacBook: цвета + фото + диагональ, накопитель, RAM. Для остальных категорий: только цвет, фото и цена. Старая цена необязательна: если заполнить, на витрине она будет перечёркнутой, а скидка в процентах посчитается сама. Уже сохранённые варианты не затираются: при редактировании подтягиваются текущие параметры.
              </p>
              {productFormError ? <p className="text-sm font-medium text-red-600">{productFormError}</p> : null}
              <div className="flex items-center gap-2">
                <button type="submit" className="btn-primary">
                  {editingProductId ? "Сохранить изменения" : "Сохранить товар"}
                </button>
                {editingProductId ? (
                  <button
                    type="button"
                    className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700"
                    onClick={resetProductForm}
                  >
                    Отмена
                  </button>
                ) : null}
              </div>
            </form>
          </section>
        </div>

        <section className="mt-6 rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-xl font-semibold">Товары по категориям</h2>
          <div className="space-y-6">
            {productsByCategory.map(({ category, items }) => (
              <div key={category.id}>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-lg font-semibold">{category.name}</h3>
                  {!PROTECTED_CATEGORY_SLUGS.has(category.slug) ? (
                    <button
                      type="button"
                      className="shrink-0 rounded-lg border border-red-200 bg-red-50 px-3 py-1 text-sm font-medium text-red-700 transition hover:bg-red-100"
                      onClick={() => removeCategory(category.id, category.name, category.slug)}
                    >
                      Удалить категорию
                    </button>
                  ) : null}
                </div>
                {items.length ? (
                  <div className="grid gap-3">
                    {items.map((item) => (
                      <div key={item.id} className="flex items-center justify-between rounded-xl border p-3">
                        <div>
                          <p className="font-medium">{item.name}</p>
                          {item.description ? <p className="text-xs text-zinc-500">Описание: {item.description}</p> : null}
                          <p className="text-sm text-zinc-500">Базовая цена: {toRub(item.basePrice)}</p>
                          {item.compareAtPrice ? (
                            <p className="text-xs text-[#800020] line-through">Старая цена: {toRub(item.compareAtPrice)}</p>
                          ) : null}
                          {item.variants?.length ? (
                            <div className="mt-1 space-y-1 text-xs text-zinc-500">
                              {item.variants.map((variant, index) => {
                                const segments = [
                                  variant.color,
                                  variant.screen,
                                  variant.memory,
                                  variant.ram,
                                  variant.simType
                                ].filter((value): value is string => Boolean(value && value.trim()));
                                const label = segments.length ? segments.join(" / ") : "—";
                                return (
                                  <p key={`${item.id}-${index}`}>
                                    {label} — {toRub(variant.price)}
                                    {variant.compareAtPrice ? (
                                      <span className="ml-1 text-[#800020] line-through">
                                        {toRub(variant.compareAtPrice)}
                                      </span>
                                    ) : null}
                                  </p>
                                );
                              })}
                            </div>
                          ) : item.memoryPrices ? (
                            <p className="text-xs text-zinc-500">
                              По памяти:{" "}
                              {Object.entries(item.memoryPrices)
                                .map(([memory, price]) => `${memory} — ${toRub(price)}`)
                                .join(", ")}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="rounded-lg border border-zinc-300 px-3 py-1 text-sm text-zinc-700"
                            onClick={() => startEditProduct(item)}
                          >
                            Редактировать
                          </button>
                          <button
                            type="button"
                            className="rounded-lg border border-red-200 px-3 py-1 text-sm text-red-600"
                            onClick={() => removeProduct(item.id)}
                          >
                            Удалить
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-xl border border-dashed p-3 text-sm text-zinc-500">Товаров нет</p>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
