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

const OTP_PURPOSES = ["login", "signup", "phone_verify", "password_reset"] as const;

export const otpRequestSchema = z
  .object({
    target: z.string().min(6), // phone or email
    purpose: z.enum(OTP_PURPOSES).default("login")
  })
  .refine((v) => v.purpose !== "password_reset" || z.string().email().safeParse(v.target).success, { message: "Enter the email address of your account" });
export type OtpRequestDto = z.infer<typeof otpRequestSchema>;

export const otpVerifySchema = z.object({
  target: z.string().min(6),
  code: z.string().length(6),
  purpose: z.enum(["login", "signup", "phone_verify"]).default("login") // a password reset is verified by its own endpoint
});
export type OtpVerifyDto = z.infer<typeof otpVerifySchema>;

const newPassword = z.string().min(8, "Password must be at least 8 characters").max(200);

export const passwordResetSchema = z.object({ email: z.string().email(), code: z.string().length(6), newPassword });
export type PasswordResetDto = z.infer<typeof passwordResetSchema>;

export const changePasswordSchema = z.object({
  // Required when the account already has a password; an account that only ever used Google or a code has none yet.
  currentPassword: z.string().min(1).optional(),
  newPassword
});
export type ChangePasswordDto = z.infer<typeof changePasswordSchema>;
