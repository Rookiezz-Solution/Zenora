import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { AuthedRequest } from "../guards/jwt-auth.guard";

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const req = ctx.switchToHttp().getRequest<AuthedRequest>();
  return req.userId!;
});
