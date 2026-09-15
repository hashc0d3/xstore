import { Type, Transform } from "class-transformer";
import { IsArray, IsInt, IsObject, IsOptional, IsString, Min, ValidateNested } from "class-validator";

function emptyToUndefined({ value }: { value: unknown }) {
  if (value === "" || value === null || value === undefined) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.round(n);
}

class ProductVariantDto {
  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsString()
  memory?: string;

  @IsOptional()
  @IsString()
  simType?: string;

  @IsOptional()
  @IsString()
  screen?: string;

  @IsOptional()
  @IsString()
  ram?: string;

  @IsInt()
  @Min(0)
  price!: number;

  @IsOptional()
  @Transform(emptyToUndefined, { toClassOnly: true })
  @IsInt()
  @Min(1)
  compareAtPrice?: number;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  /** in_stock | coming_soon | out_of_stock | unknown */
  @IsOptional()
  @IsString()
  availability?: string;
}

export class UpsertProductDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  name!: string;

  @IsString()
  categorySlug!: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsInt()
  @Min(0)
  basePrice!: number;

  @IsOptional()
  @Transform(emptyToUndefined, { toClassOnly: true })
  @IsInt()
  @Min(1)
  compareAtPrice?: number;

  @IsOptional()
  @IsObject()
  memoryPrices?: Record<string, number>;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductVariantDto)
  variants?: ProductVariantDto[];

  @IsOptional()
  @IsString()
  imageUrl?: string;
}
