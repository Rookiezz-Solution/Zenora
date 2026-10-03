import { BadRequestException, ConflictException, HttpException, HttpStatus, Injectable, NotFoundException } from "@nestjs/common";
import { LINK_IN_BIO_CONSENT_TEXT, normalizePhone } from "@zenora/shared";
import { PrismaService } from "../prisma/prisma.service";
import { RoutingEngineService } from "../routing/routing-engine.service";
import type { CallbackRequestDto, UpsertLinkInBioDto } from "./link-in-bio.dto";

const WINDOW_MS = 10 * 60_000;
const MAX_PER_WINDOW = 5;

@Injectable()
export class LinkInBioService {
  // Per-process, per ip+slug. Good enough to blunt a casual flood on a single
  // API instance; a shared limiter (Redis) is a follow-up if this scales out.
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly routing: RoutingEngineService
  ) {}

  get(workspaceId: string) {
    return this.prisma.client.linkInBioPage.findUnique({ where: { workspaceId } });
  }

  async upsert(workspaceId: string, dto: UpsertLinkInBioDto) {
    const whatsappPhone = dto.whatsappPhone ? normalizePhone(dto.whatsappPhone) : null;
    if (dto.whatsappPhone && !whatsappPhone) throw new BadRequestException("WhatsApp number must be 8-15 digits");

    const taken = await this.prisma.client.linkInBioPage.findUnique({ where: { slug: dto.slug } });
    if (taken && taken.workspaceId !== workspaceId) throw new ConflictException("That address is already taken");

    const data = { slug: dto.slug, title: dto.title, bio: dto.bio ?? null, whatsappPhone, brochureUrl: dto.brochureUrl ?? null, published: dto.published };
    return this.prisma.client.linkInBioPage.upsert({ where: { workspaceId }, create: { workspaceId, ...data }, update: data });
  }

  // Only what a visitor should see — never the workspace id.
  async getPublic(slug: string) {
    const page = await this.prisma.client.linkInBioPage.findUnique({ where: { slug } });
    if (!page || !page.published) throw new NotFoundException("Page not found");
    return {
      title: page.title,
      bio: page.bio,
      whatsappPhone: page.whatsappPhone,
      brochureUrl: page.brochureUrl,
      consentText: LINK_IN_BIO_CONSENT_TEXT
    };
  }

  // Inbound lead capture is never blocked by plan limits (docs/PLANS_AND_LIMITS.md).
  // An existing phone gets a fresh consent record instead of a duplicate lead,
  // and the response is identical either way so a visitor can't probe which
  // numbers the business already has.
  async submitCallback(slug: string, ip: string, dto: CallbackRequestDto) {
    this.enforceRateLimit(`${ip}:${slug}`);

    const page = await this.prisma.client.linkInBioPage.findUnique({ where: { slug } });
    if (!page || !page.published) throw new NotFoundException("Page not found");
    const phone = normalizePhone(dto.phone);
    if (!phone) throw new BadRequestException("Enter a valid phone number");

    const existing = await this.prisma.client.lead.findFirst({ where: { workspaceId: page.workspaceId, phone, mergedIntoId: null } });
    const consent = { type: "data_processing", granted: true, source: `link_in_bio:${slug} | ${LINK_IN_BIO_CONSENT_TEXT}` };

    if (existing) {
      await this.prisma.client.consent.create({ data: { leadId: existing.id, ...consent } });
      return { ok: true };
    }

    const lead = await this.prisma.client.lead.create({
      data: { workspaceId: page.workspaceId, name: dto.name, phone, source: "link_in_bio", consents: { create: consent } }
    });
    await this.routing.applyToNewLead(page.workspaceId, lead.id);
    return { ok: true };
  }

  private enforceRateLimit(key: string) {
    const now = Date.now();
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
    if (recent.length >= MAX_PER_WINDOW) throw new HttpException("Too many requests — try again later", HttpStatus.TOO_MANY_REQUESTS);
    this.hits.set(key, [...recent, now]);
  }
}
