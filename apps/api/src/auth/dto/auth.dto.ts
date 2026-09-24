import { z } from "zod";

export const signUpSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(1).optional()
});
export type SignUpDto = z.infer<typeof signUpSchema>;

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});
export type LoginDto = z.infer<typeof loginSchema>;

export const otpRequestSchema = z.object({
  target: z.string().min(6), // phone or email
  purpose: z.enum(["login", "signup", "phone_verify"]).default("login")
});
export type OtpRequestDto = z.infer<typeof otpRequestSchema>;

export const otpVerifySchema = z.object({
  target: z.string().min(6),
  code: z.string().length(6),
  purpose: z.enum(["login", "signup", "phone_verify"]).default("login")
});
export type OtpVerifyDto = z.infer<typeof otpVerifySchema>;
