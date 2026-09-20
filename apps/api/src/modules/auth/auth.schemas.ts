import { z } from 'zod';

export const registerBodySchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1).max(200),
  accept_terms: z.literal(true),
});
export type RegisterBody = z.infer<typeof registerBodySchema>;

export const loginBodySchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1).max(200),
});
export type LoginBody = z.infer<typeof loginBodySchema>;

export const refreshBodySchema = z.object({
  refresh_token: z.string().min(1),
});
export type RefreshBody = z.infer<typeof refreshBodySchema>;

export const logoutBodySchema = z.object({
  refresh_token: z.string().min(1),
});
export type LogoutBody = z.infer<typeof logoutBodySchema>;

export const forgotPasswordBodySchema = z.object({
  email: z.string().email().max(255),
});
export type ForgotPasswordBody = z.infer<typeof forgotPasswordBodySchema>;

export const resetPasswordBodySchema = z.object({
  token: z.string().min(1),
  new_password: z.string().min(1).max(200),
});
export type ResetPasswordBody = z.infer<typeof resetPasswordBodySchema>;

export const authTokensSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  expires_in: z.number(),
});
