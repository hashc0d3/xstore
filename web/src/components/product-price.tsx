import { priceDiscountPercent, toRub } from "@/lib/store";

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
          <p className={`relative mt-0.5 w-fit font-medium tabular-nums tracking-tight text-red-500 ${compareClass}`}>
            {toRub(compareAtPrice as number)}
            <span aria-hidden className="pointer-events-none absolute top-1/2 left-0 h-[1.5px] w-full -translate-y-1/2 rounded-full bg-red-500" />
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
