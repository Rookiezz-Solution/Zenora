import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { encryptToken } from "../common/encryption";
import { loadEnv } from "../config/env";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { MetaGraphClient } from "./meta-graph.client";

const INSTAGRAM_SCOPES = [
  "instagram_basic",
  "instagram_manage_messages",
  "instagram_manage_comments",
  "pages_show_list",
  "pages_manage_metadata"
].join(",");

@Injectable()
export class InstagramService {
  private readonly logger = new Logger(InstagramService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly meta: MetaGraphClient
  ) {}

  buildAuthorizeUrl(state: string): string {
    const env = loadEnv();
    if (!env.META_APP_ID) {
      throw new BadRequestException("META_APP_ID is not configured — create the Meta app first (docs/INTEGRATIONS.md)");
    }
    const url = new URL("https://www.facebook.com/dialog/oauth");
    url.searchParams.set("client_id", env.META_APP_ID);
    url.searchParams.set("redirect_uri", this.redirectUri());
    url.searchParams.set("scope", INSTAGRAM_SCOPES);
    url.searchParams.set("state", state);
    url.searchParams.set("response_type", "code");
    return url.toString();
  }

  redirectUri(): string {
    return `${loadEnv().API_URL}/channels/instagram/callback`;
  }

  async handleCallback(code: string, workspaceId: string, userId: string) {
    const shortLivedToken = await this.meta.exchangeCodeForUserToken(code, this.redirectUri());
    const { accessToken: longLivedToken } = await this.meta.getLongLivedToken(shortLivedToken);
    const pages = await this.meta.listInstagramAccounts(longLivedToken);

    if (pages.length === 0) {
      throw new BadRequestException("No Instagram professional account is linked to any of your Facebook Pages");
    }
    if (pages.length > 1) {
      // TODO(Phase 1 follow-up): let the user pick which Page/IG account to
      // connect instead of defaulting to the first. Fine for a pilot with
      // one Page per business.
      this.logger.warn(`Workspace ${workspaceId} has ${pages.length} linked IG accounts; connecting the first`);
    }
    const chosen = pages[0]!;

    const account = await this.prisma.client.instagramAccount.upsert({
      where: { igUserId: chosen.igUserId },
      update: { workspaceId, accessTokenCipher: encryptToken(chosen.pageAccessToken), username: chosen.username, status: "active" },
      create: {
        workspaceId,
        igUserId: chosen.igUserId,
        username: chosen.username,
        accessTokenCipher: encryptToken(chosen.pageAccessToken)
      }
    });

    await this.audit.log({
      workspaceId,
      userId,
      action: "channel.instagram_connected",
      entityType: "instagram_account",
      entityId: account.id,
      metadata: { username: chosen.username ?? "" }
    });

    return account;
  }
}
