import { Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { CreateLeadDto } from "./dto/create-lead.dto";
import { formatLeadMessage } from "./lead-message";
import { loadSentIds, markSent, outboxSecretsMatch } from "./telegram-outbox";

const LEAD_TITLE = "Новая заявка X:STORE55";

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

    const sent = await this.sendToTelegram(dto).catch((err: unknown) => {
      this.logger.warn(`Telegram: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    });
    if (sent) {
      markSent([lead.id]);
    }
    return lead;
  }

  assertOutboxAuth(authorization: string | undefined): void {
    if (!outboxSecretsMatch(authorization, this.config.get<string>("LEADS_OUTBOX_SECRET"))) {
      throw new UnauthorizedException();
    }
  }

  async listOutbox(): Promise<{ leads: { id: string; text: string }[] }> {
    const sent = loadSentIds();
    const rows = await this.prisma.lead.findMany({
      orderBy: { createdAt: "asc" },
      take: 80
    });
    const leads = rows
      .filter((row) => !sent.has(row.id))
      .map((row) => ({
        id: row.id,
        text: formatLeadMessage(LEAD_TITLE, (row.payload ?? row) as CreateLeadDto)
      }));
    return { leads };
  }

  ackOutbox(ids: string[]): { ok: true } {
    markSent(ids.filter((id) => typeof id === "string" && id.length > 0));
    return { ok: true };
  }

  private async sendToTelegram(dto: CreateLeadDto): Promise<boolean> {
    const token = this.config.get<string>("TELEGRAM_BOT_TOKEN")?.trim();
    let chatIdRaw = this.config.get<string>("TELEGRAM_CHAT_ID")?.trim();
    if (!token || !chatIdRaw) {
      this.logger.warn("Telegram: пропуск — не заданы TELEGRAM_BOT_TOKEN или TELEGRAM_CHAT_ID в .env");
      return false;
    }
    if (
      (chatIdRaw.startsWith('"') && chatIdRaw.endsWith('"')) ||
      (chatIdRaw.startsWith("'") && chatIdRaw.endsWith("'"))
    ) {
      chatIdRaw = chatIdRaw.slice(1, -1);
    }
    const chatId: number | string = /^-?\d+$/.test(chatIdRaw) ? Number(chatIdRaw) : chatIdRaw;
    const apiBase = (this.config.get<string>("TELEGRAM_API_BASE")?.trim() || "https://api.telegram.org").replace(
      /\/+$/,
      ""
    );

    const res = await fetch(`${apiBase}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: formatLeadMessage(LEAD_TITLE, dto)
      })
    });

    const data = (await res.json()) as { ok?: boolean; description?: string; error_code?: number };
    if (!data.ok) {
      this.logger.warn(
        `Telegram sendMessage: ${data.description ?? res.statusText} (error_code=${data.error_code ?? "?"})`
      );
      return false;
    }
    return true;
  }
}
