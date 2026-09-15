type StoreSnapshot = {
  categories: unknown[];
  products: unknown[];
  buybackConfig: unknown;
  sliderPhotos: unknown[];
};

let snapshot: StoreSnapshot | null = null;

export function getCachedStore(): StoreSnapshot | null {
  return snapshot;
}

export function setCachedStore(data: StoreSnapshot): void {
  snapshot = data;
}

export function invalidateStoreCache(): void {
  snapshot = null;
}
