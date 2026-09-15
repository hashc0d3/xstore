import { BuybackConfig, Product, SliderPhoto, StoreData, defaultStoreData } from "@/lib/store";

const VEGAN_DEFAULT_API = process.env.NODE_ENV === "production" ? "/api" : "http://localhost:4000/api";
const fromEnv = process.env.NEXT_PUBLIC_API_URL?.trim();
// Репозиторий vegan: в dev не используем localhost:4001 — это API второго проекта; $env в PowerShell сильнее .env.local.
const API_URL =
  process.env.NODE_ENV === "development" && fromEnv?.includes("localhost:4001")
    ? VEGAN_DEFAULT_API
    : fromEnv || VEGAN_DEFAULT_API;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    },
    cache: "no-store"
  });

  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${res.statusText}`);
  }

  return (await res.json()) as T;
}

export async function fetchStoreData(): Promise<StoreData> {
  try {
    return await request<StoreData>("/store");
  } catch {
    return defaultStoreData;
  }
}

export async function createCategory(input: { name: string; imageUrl?: string; memoryOptions?: string[] }): Promise<void> {
  await request("/store/categories", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function upsertProduct(input: {
  id?: string;
  name: string;
  categorySlug: string;
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
  imageUrl?: string;
}): Promise<void> {
  await request("/store/products", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function deleteProduct(id: string): Promise<void> {
  await request(`/store/products/${id}`, {
    method: "DELETE"
  });
}

export async function updateCategory(
  id: string,
  input: { name?: string; imageUrl?: string }
): Promise<void> {
  await request(`/store/categories/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export async function deleteCategory(id: string): Promise<void> {
  await request(`/store/categories/${id}`, {
    method: "DELETE"
  });
}

export async function createLead(input: {
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
  contactMethod?: string;
  paymentMethod?: string;
  deliveryMethod?: string;
  deliveryAddress?: string;
  apartmentOffice?: string;
  entrance?: string;
  floor?: string;
  intercom?: string;
  comment?: string;
  consent?: string;
  cartItems?: string;
  subtotal?: string;
  deliveryPrice?: string;
  totalPrice?: string;
  assessmentModel?: string;
  assessmentMemory?: string;
  assessmentCondition?: string;
  assessmentSimType?: string;
  batteryPercent?: string;
  expectedPrice?: string;
}): Promise<void> {
  await request("/leads", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function fetchBuybackConfig(): Promise<BuybackConfig> {
  try {
    return await request<BuybackConfig>("/store/buyback");
  } catch {
    return (
      defaultStoreData.buybackConfig ?? {
        models: [],
        memories: [],
        simTypes: [],
        conditions: []
      }
    );
  }
}

export async function upsertBuybackConfig(input: BuybackConfig): Promise<void> {
  await request("/store/buyback", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function upsertSliderPhotos(input: SliderPhoto[]): Promise<SliderPhoto[]> {
  return request<SliderPhoto[]>("/store/slider", {
    method: "POST",
    body: JSON.stringify({ photos: input })
  });
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("Не удалось прочитать файл"));
    };
    reader.onerror = () => reject(new Error("Ошибка чтения файла"));
    reader.readAsDataURL(file);
  });
}

export function resolveProductImage(product: Product): string {
  return product.imageUrl || "/image.png";
}
