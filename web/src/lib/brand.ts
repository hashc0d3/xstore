/**
 * Два независимых продакшена: X:STORE (xstore55) и SOTIK77 (sotik77).
 * Сборка задаётся только через NEXT_PUBLIC_STORE_BRAND при `next build` / Docker ARG.
 */
/** lower-case: «SOTIK77» в .env не должен ломать определение бренда */
export const STORE_BRAND = (process.env.NEXT_PUBLIC_STORE_BRAND ?? "xstore").trim().toLowerCase();

export const IS_SOTIK_BRAND = STORE_BRAND === "sotik77";

export const SITE_TITLE = IS_SOTIK_BRAND ? "SOTIK77" : "X:STORE";

export const SITE_DESCRIPTION = IS_SOTIK_BRAND
  ? "Магазин техники SOTIK77 — sotik77.ru"
  : "Магазин оригинальной техники Apple — X:STORE (xstore55.ru)";

/** SOTIK — общая ссылка на сообщество; X:STORE — официальная группа. */
export const VK_HREF = IS_SOTIK_BRAND ? "https://vk.com" : "https://vk.ru/xstore_55";

/** Главная витрина (storefront): до унификации с xstore (vegan 15309b3) / vegan-skupka ~f95cfa6 */
export const SOTIK_TELEGRAM_HREF = "https://t.me/yaroslav_g77";
export const SOTIK_PHONE_DISPLAY = "+7 (923) 696-96-82";
export const SOTIK_PHONE_HREF = "tel:+79236969682";
export const SOTIK_HEADER_ADDRESS = "Г.Москва 2 Ямская 2с1";
export const SOTIK_OPEN_HOURS_BADGE = "Сейчас открыто · 12:00–20:00";
export const SOTIK_HOURS_DETAIL = "Время работы: 12:00 - 20:00";
export const SOTIK_BUYBACK_NOTE = "Выкуп техники: круглосуточно";

/** Отзывы sotik77 на Авито (переопределяется через NEXT_PUBLIC_SOTIK_AVITO_REVIEWS_URL). */
export const SOTIK_AVITO_REVIEWS_HREF =
  (process.env.NEXT_PUBLIC_SOTIK_AVITO_REVIEWS_URL ?? "").trim() || "https://www.avito.ru/brands/i131720364";

/**
 * Разные ключи localStorage, чтобы корзины двух магазинов не пересекались в одном браузере.
 */
export const CART_STORAGE_KEY = IS_SOTIK_BRAND ? "sotik77-cart-v1" : "xstore-cart-v1";

export const SLIDER_PHOTO_ALT_FALLBACK = IS_SOTIK_BRAND ? "Фото SOTIK77" : "Фото X:STORE";

export const YANDEX_METRIKA_COUNTER_ID = 109598636;
