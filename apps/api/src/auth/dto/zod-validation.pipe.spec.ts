import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ZodValidationPipe } from "./zod-validation.pipe";

describe("ZodValidationPipe", () => {
  const schema = z.object({ a: z.string().optional(), b: z.string().optional() }).refine((v) => v.a || v.b, { message: "Provide a or b" });

  it("passes valid data through", () => {
    expect(new ZodValidationPipe(schema).transform({ a: "x" })).toEqual({ a: "x" });
  });

  it("reports field errors by field name", () => {
    try {
      new ZodValidationPipe(z.object({ a: z.string() })).transform({});
      expect.unreachable();
    } catch (err) {
      expect((err as BadRequestException).getResponse()).toMatchObject({ a: expect.any(Array) });
    }
  });

  it("reports whole-object rule failures instead of an empty object", () => {
    try {
      new ZodValidationPipe(schema).transform({});
      expect.unreachable();
    } catch (err) {
      expect((err as BadRequestException).getResponse()).toMatchObject({ form: ["Provide a or b"] });
    }
  });
});
