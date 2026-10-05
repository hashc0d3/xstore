"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { createLead, fetchBuybackConfig } from "@/lib/api";
import { isCompleteRuPhone } from "@/lib/phone";
import type { BuybackConfig } from "@/lib/store";

function formatPhone(value: string): string {
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
}

export default function AssessmentPage() {
  const [config, setConfig] = useState<BuybackConfig | null>(null);
  const [model, setModel] = useState("");
  const [memory, setMemory] = useState("");
  const [simType, setSimType] = useState("");
  const [batteryPercent, setBatteryPercent] = useState(50);
  const [expectedPrice, setExpectedPrice] = useState("");
  const [description, setDescription] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [showCatalogToast, setShowCatalogToast] = useState(false);

  useEffect(() => {
    void fetchBuybackConfig().then((next) => {
      setConfig(next);
    });
  }, []);

  if (!config) {
    return (
      <div className="min-h-screen bg-[#f4f4f6] text-zinc-900">
        <SiteHeader />
        <main className="mx-auto w-full max-w-[1920px] px-4 py-6 min-[640px]:px-6 min-[640px]:py-8 min-[960px]:px-8 min-[960px]:py-10 min-[1440px]:px-12 min-[1920px]:px-16">
          <div className="mb-4 flex items-center justify-between min-[640px]:mb-5">
            <div className="h-3 w-40 animate-pulse rounded bg-zinc-300/80" />
            <div className="h-4 w-24 animate-pulse rounded bg-zinc-300/70" />
          </div>
          <section className="overflow-hidden rounded-3xl border border-white/60 liquid-glass p-4 min-[960px]:p-6">
            <div className="grid gap-6 min-[960px]:grid-cols-[0.92fr_1.08fr]">
              <div className="min-h-[240px] animate-pulse rounded-3xl bg-zinc-200/70 min-[960px]:min-h-[620px]" />
              <div className="space-y-4 min-[960px]:pt-2">
                {Array.from({ length: 6 }, (_, i) => (
                  <div key={i} className="h-14 animate-pulse rounded-xl bg-zinc-200/65" />
                ))}
              </div>
            </div>
          </section>
        </main>
        <SiteFooter />
      </div>
    );
  }

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setNotice(null);
    if (!model || !memory || !simType || !customerName.trim() || !phone.trim()) {
      setNotice({ type: "error", text: "Заполните тип устройства, память, тип SIM, имя и номер." });
      return;
    }
    if (!isCompleteRuPhone(phone)) {
      setNotice({ type: "error", text: "Укажите полный номер телефона: +7 (999) 123-45-67" });
      return;
    }
    try {
      setSending(true);
      await createLead({
        type: "assessment",
        phone: phone.trim(),
        targetDevice: `${model} ${memory}`,
        customerName: customerName.trim(),
        assessmentModel: model,
        assessmentMemory: memory,
        assessmentSimType: simType,
        batteryPercent: String(batteryPercent),
        expectedPrice: expectedPrice.trim() || undefined,
        comment: description.trim() || undefined
      });
      setNotice({ type: "success", text: "Заявка отправлена. Менеджер скоро свяжется с вами." });
      setShowCatalogToast(true);
      setExpectedPrice("");
      setDescription("");
      setCustomerName("");
      setPhone("");
      setBatteryPercent(50);
    } catch {
      setNotice({ type: "error", text: "Не удалось отправить заявку. Попробуйте еще раз." });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f4f4f6] text-zinc-900">
      <SiteHeader />
      <main className="mx-auto w-full max-w-[1920px] px-4 py-6 min-[640px]:px-6 min-[640px]:py-8 min-[960px]:px-8 min-[960px]:py-10 min-[1440px]:px-12 min-[1920px]:px-16">
        <div className="mb-4 flex items-center justify-between min-[640px]:mb-5">
          <p className="text-xs text-zinc-400 min-[640px]:text-sm">Главная / Выкуп</p>
          <Link href="/" className="text-sm font-medium text-red-500 transition hover:text-red-600">
            На главную
          </Link>
        </div>

        <section className="overflow-hidden rounded-3xl border border-white/60 liquid-glass p-4 text-zinc-900 min-[960px]:p-6">
          <div className="grid gap-6 min-[960px]:grid-cols-[0.92fr_1.08fr]">
            <div className="relative overflow-hidden rounded-3xl border border-zinc-200 bg-[#f9f9fa] p-5 min-[960px]:min-h-[620px]">
              <h1 className="text-4xl font-bold leading-tight min-[640px]:text-5xl">
                Оценка
                <br />
                <span className="text-red-500">вашего iPhone</span>
              </h1>
              <p className="mt-6 max-w-md text-base leading-7 text-zinc-600">
                Заполните поля для оценки устройства. Чем точнее данные, тем корректнее предварительная стоимость выкупа.
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/Frame_4467.png.webp"
                alt="iPhone для оценки"
                className="pointer-events-none absolute bottom-[-4%] left-1/2 hidden h-[52%] w-auto -translate-x-1/2 object-contain opacity-95 min-[960px]:left-[44%] min-[960px]:block"
              />
            </div>

            <form className="space-y-4 min-[960px]:pt-2" onSubmit={onSubmit}>
              <label className="block space-y-2">
                <span className="text-sm font-semibold text-zinc-800">Модель вашего iPhone</span>
                <select className="field border-zinc-300 bg-white text-zinc-900" value={model} onChange={(e) => setModel(e.target.value)}>
                  <option value="">Выберите вариант из списка...</option>
                  {config.models.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-semibold text-zinc-800">Объем памяти (GB)</span>
                <select className="field border-zinc-300 bg-white text-zinc-900" value={memory} onChange={(e) => setMemory(e.target.value)}>
                  <option value="">Выберите вариант из списка...</option>
                  {config.memories.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-semibold text-zinc-800">Тип SIM</span>
                <select className="field border-zinc-300 bg-white text-zinc-900" value={simType} onChange={(e) => setSimType(e.target.value)}>
                  <option value="">Выберите вариант из списка...</option>
                  {config.simTypes.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <div className="space-y-2">
                <p className="text-sm font-semibold text-zinc-800">Состояние аккумулятора в %</p>
                <div className="inline-flex min-w-12 justify-center rounded-md bg-white px-2 py-1 text-sm font-semibold text-zinc-800">
                  {batteryPercent}
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={batteryPercent}
                  onChange={(e) => setBatteryPercent(Number(e.target.value))}
                  className="mt-2 h-2 w-full cursor-pointer accent-red-500"
                />
                <div className="flex justify-between text-sm text-zinc-500">
                  <span>0</span>
                  <span>100</span>
                </div>
              </div>

              <label className="block space-y-2">
                <span className="text-sm font-semibold text-zinc-800">В какую стоимость вы оцениваете Ваш телефон?</span>
                <p className="text-xs text-zinc-500">Можно указать желаемую сумму или комментарий.</p>
                <input
                  className="field border-zinc-300 bg-white text-zinc-900"
                  placeholder="Например, 65 000 ₽"
                  value={expectedPrice}
                  inputMode="numeric"
                  onChange={(e) => setExpectedPrice(e.target.value.replace(/\D/g, ""))}
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-semibold text-zinc-800">Описание</span>
                <textarea
                  className="field min-h-24 resize-y border-zinc-300 bg-white text-zinc-900"
                  placeholder="Укажите особенности и дефекты"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </label>

              <div className="grid gap-3 min-[640px]:grid-cols-2">
                <input
                  className="field border-zinc-300 bg-white text-zinc-900"
                  placeholder="Ваше имя"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                />
                <input
                  className="field border-zinc-300 bg-white text-zinc-900"
                  placeholder="+7 (000) 000-00-00"
                  value={phone}
                  onChange={(e) => setPhone(formatPhone(e.target.value))}
                />
              </div>

              {notice ? (
                <p className={`text-sm font-medium ${notice.type === "success" ? "text-emerald-600" : "text-red-600"}`}>{notice.text}</p>
              ) : null}

              <button
                type="submit"
                className="btn-primary w-full disabled:opacity-60"
                disabled={sending}
              >
                {sending ? "Отправка..." : "Узнать цену"}
              </button>
            </form>
          </div>
        </section>
      </main>
      <SiteFooter />

      {showCatalogToast ? (
        <div className="fixed bottom-4 right-4 z-50 w-[calc(100%-2rem)] max-w-sm min-[640px]:bottom-6 min-[640px]:right-6">
          <div className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-[#121317] p-4 text-white shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/img3.png" alt="" aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-40" />
            <div className="pointer-events-none absolute inset-0 bg-black/55" />

            <button
              type="button"
              onClick={() => setShowCatalogToast(false)}
              className="absolute right-3 top-2 text-lg leading-none text-zinc-300 transition hover:text-white"
              aria-label="Закрыть уведомление"
            >
              ×
            </button>

            <div className="relative z-10 space-y-3 pr-5">
              <p className="text-sm font-semibold leading-5">
                Хотите подобрать новое устройство?
              </p>
              <p className="text-xs text-zinc-200">
                Перейдите в каталог и выберите подходящую модель.
              </p>
              <Link href="/catalog" className="inline-flex rounded-xl bg-red-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-600">
                Каталог
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
