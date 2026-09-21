import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { CreateLeadDto } from "./dto/create-lead.dto";

@Injectable()
export class LeadsService {
  private readonly logger = new Logger(LeadsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService
  ) {}

  async createLead(dto: CreateLeadDto) {
    const lead = await this.prisma.lead.create({
      data: {
        type: dto.type,
        phone: dto.phone,
        deviceFrom: dto.deviceFrom?.trim() || null,
        deviceTo: dto.deviceTo?.trim() || null,
        targetDevice: dto.targetDevice?.trim() || null,
        payload: JSON.parse(JSON.stringify(dto)) as Prisma.InputJsonValue
      }
    });

    await this.sendToTelegram(dto).catch(() => undefined);
    return lead;
  }

  private async sendToTelegram(dto: CreateLeadDto): Promise<void> {
    const token = this.config.get<string>("TELEGRAM_BOT_TOKEN")?.trim();
    let chatIdRaw = this.config.get<string>("TELEGRAM_CHAT_ID")?.trim();
    if (!token || !chatIdRaw) {
      this.logger.warn("Telegram: пропуск — не заданы TELEGRAM_BOT_TOKEN или TELEGRAM_CHAT_ID в .env");
      return;
    }
    if (
      (chatIdRaw.startsWith('"') && chatIdRaw.endsWith('"')) ||
      (chatIdRaw.startsWith("'") && chatIdRaw.endsWith("'"))
    ) {
      chatIdRaw = chatIdRaw.slice(1, -1);
    }
    const chatId: number | string = /^-?\d+$/.test(chatIdRaw) ? Number(chatIdRaw) : chatIdRaw;

    const lines = [
      "Новая заявка X:STORE55",
      `Тип: ${dto.type}`,
      `Телефон: ${dto.phone}`,
      dto.customerName ? `Имя: ${dto.customerName}` : "",
      dto.telegram ? `Telegram: ${dto.telegram}` : "",
      dto.contactMethod ? `Способ связи: ${dto.contactMethod}` : "",
      dto.paymentMethod ? `Оплата: ${dto.paymentMethod}` : "",
      dto.deliveryMethod ? `Получение: ${dto.deliveryMethod}` : "",
      dto.deliveryAddress ? `Адрес доставки: ${dto.deliveryAddress}` : "",
      dto.apartmentOffice ? `Квартира / офис: ${dto.apartmentOffice}` : "",
      dto.entrance ? `Подъезд: ${dto.entrance}` : "",
      dto.floor ? `Этаж: ${dto.floor}` : "",
      dto.intercom ? `Домофон: ${dto.intercom}` : "",
      dto.comment ? `Комментарий: ${dto.comment}` : "",
      dto.consent ? `Согласие ПД: ${dto.consent}` : "",
      dto.deviceFrom ? `Устройство для обмена: ${dto.deviceFrom}` : "",
      dto.deviceTo ? `Устройство к покупке: ${dto.deviceTo}` : "",
      dto.targetDevice ? `Желаемое устройство: ${dto.targetDevice}` : "",
      dto.productName ? `Наименование: ${dto.productName}` : "",
      dto.color ? `Цвет: ${dto.color}` : "",
      dto.memory ? `Объем памяти: ${dto.memory}` : "",
      dto.simType ? `Тип SIM: ${dto.simType}` : "",
      dto.screen ? `Диагональ / экран: ${dto.screen}` : "",
      dto.ram ? `RAM: ${dto.ram}` : "",
      dto.cartItems ? `Товары:\n${dto.cartItems}` : "",
      dto.subtotal ? `Сумма товаров: ${dto.subtotal}` : "",
      dto.deliveryPrice ? `Доставка: ${dto.deliveryPrice}` : "",
      dto.totalPrice ? `Итого: ${dto.totalPrice}` : "",
      dto.assessmentModel ? `Модель (выкуп): ${dto.assessmentModel}` : "",
      dto.assessmentMemory ? `Память (выкуп): ${dto.assessmentMemory}` : "",
      dto.assessmentCondition ? `Состояние (выкуп): ${dto.assessmentCondition}` : "",
      dto.assessmentSimType ? `Тип SIM (выкуп): ${dto.assessmentSimType}` : "",
      dto.batteryPercent ? `Батарея: ${dto.batteryPercent}%` : "",
      dto.expectedPrice ? `Ожидаемая цена: ${dto.expectedPrice}` : ""
    ].filter(Boolean);

    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: lines.join("\n")
      })
    });

    const data = (await res.json()) as { ok?: boolean; description?: string; error_code?: number };
    if (!data.ok) {
      this.logger.warn(
        `Telegram sendMessage: ${data.description ?? res.statusText} (error_code=${data.error_code ?? "?"})`
      );
    }
  }
}
