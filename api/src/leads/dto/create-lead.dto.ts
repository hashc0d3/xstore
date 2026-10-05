import { IsIn, IsOptional, IsString, Matches } from "class-validator";

export class CreateLeadDto {
  @IsIn(["tradein", "assessment", "order"])
  type!: "tradein" | "assessment" | "order";

  @IsString()
  @Matches(/^\+7 \(\d{3}\) \d{3}-\d{2}-\d{2}$/, {
    message: "Укажите полный номер телефона: +7 (999) 123-45-67"
  })
  phone!: string;

  @IsOptional()
  @IsString()
  deviceFrom?: string;

  @IsOptional()
  @IsString()
  deviceTo?: string;

  @IsOptional()
  @IsString()
  targetDevice?: string;

  @IsOptional()
  @IsString()
  productName?: string;

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

  @IsOptional()
  @IsString()
  customerName?: string;

  @IsOptional()
  @IsString()
  telegram?: string;

  @IsOptional()
  @IsString()
  contactMethod?: string;

  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @IsOptional()
  @IsString()
  deliveryMethod?: string;

  @IsOptional()
  @IsString()
  deliveryAddress?: string;

  @IsOptional()
  @IsString()
  apartmentOffice?: string;

  @IsOptional()
  @IsString()
  entrance?: string;

  @IsOptional()
  @IsString()
  floor?: string;

  @IsOptional()
  @IsString()
  intercom?: string;

  @IsOptional()
  @IsString()
  comment?: string;

  @IsOptional()
  @IsString()
  consent?: string;

  @IsOptional()
  @IsString()
  cartItems?: string;

  @IsOptional()
  @IsString()
  subtotal?: string;

  @IsOptional()
  @IsString()
  deliveryPrice?: string;

  @IsOptional()
  @IsString()
  totalPrice?: string;

  @IsOptional()
  @IsString()
  assessmentModel?: string;

  @IsOptional()
  @IsString()
  assessmentMemory?: string;

  @IsOptional()
  @IsString()
  assessmentCondition?: string;

  @IsOptional()
  @IsString()
  assessmentSimType?: string;

  @IsOptional()
  @IsString()
  batteryPercent?: string;

  @IsOptional()
  @IsString()
  expectedPrice?: string;
}
