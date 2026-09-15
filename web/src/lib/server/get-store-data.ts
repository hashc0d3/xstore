import "server-only";

import type { StoreData } from "../store";
import { defaultStoreData } from "../store";

function apiBase(): string {
  const raw = process.env.API_INTERNAL_URL ?? "http://127.0.0.1:4000";
  return raw.replace(/\/$/, "");
}

/** Данные витрины для SSR: один запрос к API на сервере, без «пустой» первой отрисовки. */
export async function getStoreDataServer(): Promise<StoreData> {
  try {
    const res = await fetch(`${apiBase()}/api/store`, {
      next: { revalidate: 20 },
      headers: { Accept: "application/json" }
    });
    if (!res.ok) throw new Error(`store ${res.status}`);
    return (await res.json()) as StoreData;
  } catch {
    return defaultStoreData;
  }
}
