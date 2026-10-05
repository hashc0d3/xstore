"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { createLead } from "@/lib/api";
import { CART_STORAGE_KEY } from "@/lib/brand";
import { isCompleteRuPhone } from "@/lib/phone";
import { toRub } from "@/lib/store";

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

const DELIVERY_PRICE = 2000;

function persistCartItems(items: CartItem[]) {
  window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
}

export default function CartPage() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [cartHydrated, setCartHydrated] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [telegram, setTelegram] = useState("");
  const [contactMethod, setContactMethod] = useState<"call" | "telegram">("call");
  const [deliveryMethod, setDeliveryMethod] = useState<"delivery" | "pickup">("delivery");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [apartmentOffice, setApartmentOffice] = useState("");
  const [entrance, setEntrance] = useState("");
  const [floor, setFloor] = useState("");
  const [intercom, setIntercom] = useState("");
  const [comment, setComment] = useState("");
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CART_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as CartItem[];
      if (Array.isArray(parsed)) {
        setItems(parsed);
      }
    } catch {
      setItems([]);
    } finally {
      setCartHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!cartHydrated) return;
    persistCartItems(items);
  }, [cartHydrated, items]);

  const formatPhone = (value: string): string => {
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
  };

  const total = useMemo(() => items.reduce((sum, item) => sum + item.price * item.quantity, 0), [items]);
  const delivery = items.length ? DELIVERY_PRICE : 0;
  const grandTotal = total + delivery;

  const increaseQty = (key: string) => {
    setItems((prev) => prev.map((item) => (item.key === key ? { ...item, quantity: item.quantity + 1 } : item)));
  };

  const decreaseQty = (key: string) => {
    setItems((prev) =>
      prev
        .map((item) => (item.key === key ? { ...item, quantity: Math.max(1, item.quantity - 1) } : item))
        .filter((item) => item.quantity > 0)
    );
  };

  const removeItem = (key: string) => {
    setItems((prev) => prev.filter((item) => item.key !== key));
  };

  const cartItemsText = useMemo(() => {
    return items
      .map((item) => {
        const attrs = [item.color, item.screen, item.memory, item.ram, item.simType].filter(Boolean).join(", ");
        return `• ${item.name}${attrs ? ` (${attrs})` : ""} — ${item.quantity} × ${toRub(item.price)} = ${toRub(item.quantity * item.price)}`;
      })
      .join("\n");
  }, [items]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError("");
    setFormSuccess("");

    if (!items.length) {
      setFormError("Корзина пуста.");
      return;
    }
    if (!customerName.trim() || !phone.trim()) {
      setFormError("Заполните имя и телефон.");
      return;
    }
    if (!isCompleteRuPhone(phone)) {
      setFormError("Укажите полный номер телефона: +7 (999) 123-45-67");
      return;
    }
    if (deliveryMethod === "delivery" && !deliveryAddress.trim()) {
      setFormError("Укажите адрес доставки.");
      return;
    }
    if (!consent) {
      setFormError("Необходимо согласие на обработку персональных данных.");
      return;
    }

    try {
      setSubmitting(true);
      await createLead({
        type: "order",
        phone: phone.trim(),
        customerName: customerName.trim(),
        telegram: telegram.trim() || undefined,
        contactMethod: contactMethod === "call" ? "Звонок" : "Telegram",
        paymentMethod: "Наличными",
        deliveryMethod: deliveryMethod === "delivery" ? "Доставка" : "Самовывоз",
        deliveryAddress: deliveryAddress.trim() || undefined,
        apartmentOffice: apartmentOffice.trim() || undefined,
        entrance: entrance.trim() || undefined,
        floor: floor.trim() || undefined,
        intercom: intercom.trim() || undefined,
        comment: comment.trim() || undefined,
        consent: consent ? "Да" : "Нет",
        cartItems: cartItemsText || undefined,
        subtotal: toRub(total),
        deliveryPrice: toRub(delivery),
        totalPrice: toRub(grandTotal),
        targetDevice: items[0]?.name
      });
      setItems([]);
      setCustomerName("");
      setPhone("");
      setTelegram("");
      setContactMethod("call");
      setDeliveryMethod("delivery");
      setDeliveryAddress("");
      setApartmentOffice("");
      setEntrance("");
      setFloor("");
      setIntercom("");
      setComment("");
      setConsent(false);
      setFormSuccess("Заявка отправлена. Мы скоро свяжемся с вами.");
    } catch {
      setFormError("Не удалось отправить заявку. Попробуйте еще раз.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f4f4f6] text-zinc-900">
      <SiteHeader />
      <main className="mx-auto w-full max-w-[1920px] px-4 py-6 min-[640px]:px-6 min-[640px]:py-8 min-[960px]:px-8 min-[960px]:py-10 min-[1440px]:px-12 min-[1920px]:px-16">
        <p className="mb-4 text-xs text-zinc-400 min-[640px]:mb-5 min-[640px]:text-sm">Главная / Корзина</p>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 min-[640px]:mb-5">
          <h1 className="text-3xl font-bold text-zinc-900 min-[640px]:text-5xl">Оформить заказ</h1>
          <Link
            href="/catalog"
            className="inline-flex items-center rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:border-zinc-400 hover:bg-zinc-50"
          >
            Вернуться в каталог
          </Link>
        </div>

        <div className="grid w-full gap-4 min-[960px]:grid-cols-[1fr_1fr] min-[1440px]:gap-5">
          <section className="rounded-3xl border border-white/60 liquid-glass p-4 min-[640px]:p-6">
            <h2 className="text-2xl font-bold text-zinc-900 min-[640px]:text-3xl">Контакты и доставка</h2>
            <p className="mt-1 text-sm text-zinc-500">Заполните форму, и менеджер свяжется с вами для подтверждения заказа.</p>

            <form className="mt-5 space-y-3" onSubmit={onSubmit}>
            <input
              className="field"
              placeholder="Ваше имя *"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
            />
            <input
              className="field"
              placeholder="+7"
              value={phone}
              onChange={(e) => setPhone(formatPhone(e.target.value))}
            />
            <input
              className="field"
              placeholder="Telegram (@username)"
              value={telegram}
              onChange={(e) => setTelegram(e.target.value)}
            />

            <div className="pt-1">
              <p className="mb-2 text-sm font-medium text-zinc-700">Предпочтительный способ связи</p>
              <div className="space-y-1 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    className="accent-red-500"
                    checked={contactMethod === "call"}
                    onChange={() => setContactMethod("call")}
                  />
                  <span>Звонок</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    className="accent-red-500"
                    checked={contactMethod === "telegram"}
                    onChange={() => setContactMethod("telegram")}
                  />
                  <span>Telegram</span>
                </label>
              </div>
            </div>

            <div className="pt-1">
              <p className="mb-2 text-sm font-medium text-zinc-700">Способ оплаты</p>
              <div className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-900">
                Наличными
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 rounded-xl border border-zinc-300 bg-white p-1">
              <button
                type="button"
                onClick={() => setDeliveryMethod("delivery")}
                className={`rounded-lg py-2 text-sm font-semibold transition ${
                  deliveryMethod === "delivery" ? "bg-red-500 text-white" : "text-zinc-600 hover:bg-zinc-100"
                }`}
              >
                Доставка
              </button>
              <button
                type="button"
                onClick={() => setDeliveryMethod("pickup")}
                className={`rounded-lg py-2 text-sm font-semibold transition ${
                  deliveryMethod === "pickup" ? "bg-red-500 text-white" : "text-zinc-600 hover:bg-zinc-100"
                }`}
              >
                Самовывоз
              </button>
            </div>

            {deliveryMethod === "delivery" ? (
              <>
                <input
                  className="field"
                  placeholder="Адрес доставки *"
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                />
                <input
                  className="field"
                  placeholder="Квартира / офис *"
                  value={apartmentOffice}
                  onChange={(e) => setApartmentOffice(e.target.value)}
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    className="field"
                    placeholder="Подъезд"
                    value={entrance}
                    onChange={(e) => setEntrance(e.target.value)}
                  />
                  <input
                    className="field"
                    placeholder="Этаж"
                    value={floor}
                    onChange={(e) => setFloor(e.target.value)}
                  />
                </div>
                <input
                  className="field"
                  placeholder="Домофон"
                  value={intercom}
                  onChange={(e) => setIntercom(e.target.value)}
                />
              </>
            ) : (
              <div className="rounded-xl border border-zinc-300 bg-white p-3 text-sm text-zinc-600">
                Самовывоз: г. Москва, 2-я Ямская ул., 2с1
              </div>
            )}

            <input
              className="field"
              placeholder="Комментарий курьеру (подъезд, этаж, как пройти)"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />

            <label className="flex items-start gap-2 text-xs text-zinc-500">
              <input
                type="checkbox"
                className="mt-0.5 accent-red-500"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              <span>
                Я соглашаюсь с обработкой персональных данных и ознакомлен с{" "}
                <Link href="/policy" className="font-medium text-red-500 underline-offset-2 hover:underline">
                  Политикой обработки персональных данных
                </Link>
                .
              </span>
            </label>

            {formError ? <p className="text-sm font-medium text-red-400">{formError}</p> : null}
            {formSuccess ? <p className="text-sm font-medium text-emerald-400">{formSuccess}</p> : null}

            <button
              type="submit"
              disabled={submitting || !items.length}
              className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-70"
            >
              {submitting ? "Отправка..." : "Оставить заявку"}
            </button>
            </form>
          </section>

          <section className="rounded-3xl border border-white/60 liquid-glass p-4 min-[640px]:p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-zinc-900 min-[640px]:text-3xl">Корзина</h2>
              <Link href="/catalog" className="text-sm font-medium text-red-500 hover:text-red-600">
                В каталог
              </Link>
            </div>

            {items.length ? (
              <div className="space-y-3">
                {items.map((item) => (
                  <article key={item.key} className="rounded-2xl border border-zinc-200 bg-[#f9f9fa] p-3">
                    <div className="flex items-start gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={item.imageUrl} alt={item.name} className="h-16 w-16 rounded-lg border border-zinc-200 bg-white object-cover" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-lg font-semibold text-zinc-900 min-[640px]:text-xl">{item.name}</p>
                        {item.color ? <p className="text-sm text-zinc-600">Цвет: {item.color}</p> : null}
                        {item.screen ? (
                          <p className="text-sm text-zinc-600">
                            {/\d+\s*mm/i.test(item.screen) ? "Размер корпуса" : "Диагональ"}: {item.screen}
                          </p>
                        ) : null}
                        {item.memory ? <p className="text-sm text-zinc-600">Память: {item.memory}</p> : null}
                        {item.ram ? <p className="text-sm text-zinc-600">Оперативная память: {item.ram}</p> : null}
                        {item.simType ? (
                          <p className="text-sm text-zinc-600">
                            {/wi-?fi/i.test(item.simType)
                              ? "Связь"
                              : /sim/i.test(item.simType)
                                ? "SIM-карта"
                                : "Ремешок"}
                            : {item.simType}
                          </p>
                        ) : null}
                        <div className="mt-2 inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => decreaseQty(item.key)}
                            className="h-8 w-8 rounded-full border border-zinc-300 bg-white text-lg leading-none text-zinc-700 transition hover:border-zinc-400"
                          >
                            −
                          </button>
                          <span className="w-6 text-center text-sm font-semibold text-zinc-800">{item.quantity}</span>
                          <button
                            type="button"
                            onClick={() => increaseQty(item.key)}
                            className="h-8 w-8 rounded-full border border-zinc-300 bg-white text-lg leading-none text-zinc-700 transition hover:border-zinc-400"
                          >
                            +
                          </button>
                        </div>
                      </div>
                      <div className="text-right">
                        <button
                          type="button"
                          onClick={() => removeItem(item.key)}
                          className="mb-2 text-sm text-zinc-500 transition hover:text-red-500"
                        >
                          Удалить
                        </button>
                        <p className="text-lg font-semibold text-zinc-900">{toRub(item.quantity * item.price)}</p>
                      </div>
                    </div>
                  </article>
                ))}

                <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="text-zinc-600">Сумма</span>
                    <span className="font-semibold text-zinc-900">{toRub(total)}</span>
                  </div>
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="text-zinc-600">Доставка</span>
                    <span className="font-semibold text-zinc-900">{toRub(delivery)}</span>
                  </div>
                  <p className="text-xs text-zinc-500">Минимум 2000 ₽ + 100 ₽ за км от МКАД. Менеджер уточнит сумму после заявки.</p>
                  <div className="mt-3 border-t border-zinc-200 pt-3">
                    <div className="flex items-center justify-between">
                      <span className="text-3xl font-bold text-zinc-900">Итого</span>
                      <span className="text-3xl font-bold text-zinc-900">{toRub(grandTotal)}</span>
                    </div>
                    <p className="mt-1 text-sm font-semibold text-emerald-600">Оплата наличными</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-8 text-center text-zinc-500">
                Корзина пуста.
              </div>
            )}
          </section>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

