import { z } from "zod";
import { ADDON_PRICES_INR, PLAN_IDS, TOPUP_PRICES_INR } from "@zenora/shared";

const addonKeys = Object.keys(ADDON_PRICES_INR) as [keyof typeof ADDON_PRICES_INR, ...Array<keyof typeof ADDON_PRICES_INR>];
const topupKeys = Object.keys(TOPUP_PRICES_INR) as [keyof typeof TOPUP_PRICES_INR, ...Array<keyof typeof TOPUP_PRICES_INR>];

export const createCheckoutOrderSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("plan"), planId: z.enum(PLAN_IDS), billingCycle: z.enum(["monthly", "yearly"]) }),
  z.object({ kind: z.literal("addon"), addonKey: z.enum(addonKeys), quantity: z.number().int().positive().default(1) }),
  z.object({ kind: z.literal("topup"), topupKey: z.enum(topupKeys) })
]);
export type CreateCheckoutOrderDto = z.infer<typeof createCheckoutOrderSchema>;

export const confirmPaymentSchema = z.object({
  razorpayOrderId: z.string().min(1),
  razorpayPaymentId: z.string().min(1),
  razorpaySignature: z.string().min(1)
});
export type ConfirmPaymentDto = z.infer<typeof confirmPaymentSchema>;

export const updateBillingProfileSchema = z.object({
  billingName: z.string().min(1).optional(),
  gstin: z
    .string()
    .regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, "Not a valid GSTIN")
    .optional(),
  billingAddress: z.string().min(1).optional()
});
export type UpdateBillingProfileDto = z.infer<typeof updateBillingProfileSchema>;
