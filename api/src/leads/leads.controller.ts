import { Body, Controller, Get, Headers, Post } from "@nestjs/common";
import { CreateLeadDto } from "./dto/create-lead.dto";
import { LeadsService } from "./leads.service";

@Controller("leads")
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Post()
  async createLead(@Body() dto: CreateLeadDto) {
    const lead = await this.leadsService.createLead(dto);
    return { ok: true, id: lead.id };
  }

  @Get("outbox")
  async listOutbox(@Headers("authorization") authorization?: string) {
    this.leadsService.assertOutboxAuth(authorization);
    return this.leadsService.listOutbox();
  }

  @Post("outbox/ack")
  ackOutbox(@Headers("authorization") authorization?: string, @Body() body?: { ids?: string[] }) {
    this.leadsService.assertOutboxAuth(authorization);
    return this.leadsService.ackOutbox(body?.ids ?? []);
  }
}
