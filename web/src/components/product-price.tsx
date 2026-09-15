"use client";

import { useRef, useState } from "react";
import { priceDiscountPercent, toRub } from "@/lib/store";

const CASH_DISCOUNT_HINT =
  "Скидка действует только при оплате наличными. При оплате картой скидка не учитывается.";

type ProductPriceProps = {
  price: number;
  compareAtPrice?: number;
  prefix?: string;
  label?: string;
  unavailableText: string;
  size?: "card" | "modal";
};

export function ProductPrice({
  price,
  compareAtPrice,
  prefix = "от ",
  label,
  unavailableText,
  size = "card"
}: ProductPriceProps) {
  const percent = priceDiscountPercent(price, compareAtPrice);
  const showCompare = Boolean(compareAtPrice && compareAtPrice > price && price > 0);
  const isModal = size === "modal";
  const priceClass = isModal
    ? "text-sm font-semibold tabular-nums leading-tight text-zinc-900 min-[640px]:text-base"
    : "text-base font-bold tabular-nums leading-tight text-zinc-900 min-[480px]:text-lg min-[960px]:text-xl";
  const compareClass = isModal
    ? "text-[12px] min-[640px]:text-[13px]"
    : "text-[11px] min-[480px]:text-xs";
  const badgeClass = isModal
    ? "h-8 min-w-8 px-1 text-[10px] min-[640px]:h-9 min-[640px]:min-w-9 min-[640px]:text-[11px]"
    : "h-7 min-w-7 px-1 text-[9px] min-[480px]:h-8 min-[480px]:min-w-8 min-[480px]:text-[10px]";

  if (price <= 0) {
    return (
      <p className={priceClass}>
        {label}
        {unavailableText}
      </p>
    );
  }

  return (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <p className={priceClass}>
          {label}
          {prefix}
          {toRub(price)}
        </p>
        {showCompare ? (
          <p className={`mt-0.5 flex items-center gap-1 ${compareClass}`}>
            <span className="relative w-fit font-medium tabular-nums tracking-tight text-red-500">
              {toRub(compareAtPrice as number)}
              <span aria-hidden className="pointer-events-none absolute top-1/2 left-0 h-[1.5px] w-full -translate-y-1/2 rounded-full bg-red-500" />
            </span>
            <PriceInfoHint />
          </p>
        ) : null}
      </div>
      {showCompare && percent != null ? (
        <span
          className={`sale-badge mt-0.5 flex shrink-0 items-center justify-center rounded-full font-extrabold leading-none tracking-tight text-white ${badgeClass}`}
          aria-label={`Скидка ${percent} процентов`}
        >
          −{percent}%
        </span>
      ) : null}
    </div>
  );
}

function PriceInfoHint() {
  const rootRef = useRef<HTMLSpanElement>(null);
  const [side, setSide] = useState<"start" | "end">("start");

  const updateSide = () => {
    const el = rootRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const tipWidth = 220;
    const pad = 12;
    const spaceRight = window.innerWidth - rect.right - pad;
    const spaceLeft = rect.left - pad;
    setSide(spaceRight >= tipWidth || spaceRight >= spaceLeft ? "start" : "end");
  };

  return (
    <span
      ref={rootRef}
      className="group/info relative z-30 inline-flex items-center"
      onMouseEnter={updateSide}
      onFocus={updateSide}
    >
      <button
        type="button"
        className="flex h-4 w-4 items-center justify-center rounded-full text-zinc-400 transition duration-200 hover:text-zinc-700 focus-visible:text-zinc-700 focus-visible:outline-none min-[640px]:h-[18px] min-[640px]:w-[18px]"
        aria-label={CASH_DISCOUNT_HINT}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <svg viewBox="0 0 16 16" className="h-full w-full" fill="none" aria-hidden>
          <circle cx="8" cy="8" r="6.15" stroke="currentColor" strokeWidth="1.35" />
          <circle cx="8" cy="5.15" r="0.85" fill="currentColor" />
          <path d="M8 7.15v4.05" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
        </svg>
      </button>
      <span
        data-side={side}
        className={`price-info-tip pointer-events-none absolute bottom-[calc(100%+10px)] z-30 w-[12.5rem] scale-95 rounded-2xl bg-[#ececee] px-3 py-2.5 text-left text-[11px] leading-[1.35] text-zinc-600 opacity-0 shadow-none transition duration-200 group-hover/info:scale-100 group-hover/info:opacity-100 group-focus-within/info:scale-100 group-focus-within/info:opacity-100 min-[640px]:w-[13.5rem] min-[640px]:text-xs ${
          side === "start" ? "left-0 origin-bottom-left" : "right-0 left-auto origin-bottom-right"
        }`}
      >
        {CASH_DISCOUNT_HINT}
      </span>
    </span>
  );
}
