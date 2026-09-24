import { Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer
} from "@nestjs/websockets";
import * as cookie from "cookie";
import IORedis from "ioredis";
import type { Server, Socket } from "socket.io";
import { REALTIME_CHANNEL, type InboxRealtimeEvent } from "@zenora/shared";
import { verifySession } from "../auth/jwt.util";
import { loadEnv } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";

// Client flow: connect (cookie carries the session, verified below), then
// emit "join-workspace" with a workspaceId once membership is confirmed.
// Inbound events arrive over Redis pub/sub (see RealtimeService and
// apps/worker's publisher) rather than being emitted directly from here, so
// every API/worker process stays in sync regardless of which one handled a
// given request or webhook.
@WebSocketGateway({ cors: { origin: () => true, credentials: true } })
export class InboxGateway implements OnGatewayConnection, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(InboxGateway.name);
  private readonly subscriber = new IORedis(loadEnv().REDIS_URL);

  @WebSocketServer()
  server!: Server;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.subscriber.subscribe(REALTIME_CHANNEL);
    this.subscriber.on("message", (_channel, message) => {
      try {
        const event = JSON.parse(message) as InboxRealtimeEvent;
        this.server.to(`workspace:${event.workspaceId}`).emit(event.type, event.payload);
      } catch (err) {
        this.logger.error("Failed to forward realtime event", err);
      }
    });
  }

  async onModuleDestroy() {
    await this.subscriber.quit();
  }

  handleConnection(client: Socket) {
    const cookies = cookie.parse(client.handshake.headers.cookie ?? "");
    const { SESSION_COOKIE_NAME } = loadEnv();
    const token = cookies[SESSION_COOKIE_NAME];
    try {
      const { sub } = verifySession(token ?? "");
      client.data.userId = sub;
    } catch {
      client.disconnect(true);
    }
  }

  @SubscribeMessage("join-workspace")
  async handleJoin(@ConnectedSocket() client: Socket, @MessageBody() workspaceId: string) {
    const userId = client.data.userId as string | undefined;
    if (!userId) return;
    const membership = await this.prisma.client.membership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } }
    });
    if (membership) {
      await client.join(`workspace:${workspaceId}`);
    }
  }
}
