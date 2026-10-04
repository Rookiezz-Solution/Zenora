import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { LINK_IN_BIO_CONSENT_TEXT, normalizePhone } from "@zenora/shared";
import { captureLeadWithConsent } from "../common/public-lead";
import { WebhooksService } from "../developers/webhooks.service";
import { RateLimiter } from "../common/rate-limiter";
import { PrismaService } from "../prisma/prisma.service";
import { RoutingEngineService } from "../routing/routing-engine.service";
import type { CallbackRequestDto, UpsertLinkInBioDto } from "./link-in-bio.dto";


@Injectable()
export class LinkInBioService {
  private readonly limiter = new RateLimiter(5, 10 * 60_000, "link-in-bio-callback");

  constructor(
    private readonly prisma: PrismaService,
    private readonly routing: RoutingEngineService,
    private readonly webhooks: WebhooksService
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
    await this.limiter.consume(`${ip}:${slug}`);

    const page = await this.prisma.client.linkInBioPage.findUnique({ where: { slug } });
    if (!page || !page.published) throw new NotFoundException("Page not found");
    const phone = normalizePhone(dto.phone);
    if (!phone) throw new BadRequestException("Enter a valid phone number");

    const { leadId, created } = await captureLeadWithConsent(this.prisma, {
      workspaceId: page.workspaceId,
      name: dto.name,
      phone,
      source: "link_in_bio",
      consentSource: `link_in_bio:${slug} | ${LINK_IN_BIO_CONSENT_TEXT}`
    });
    if (created) {
      await this.routing.applyToNewLead(page.workspaceId, leadId);
      await this.webhooks.emitLeadCreated(page.workspaceId, leadId);
    }
    return { ok: true };
  }

}
