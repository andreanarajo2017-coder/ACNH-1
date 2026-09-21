import { z } from 'zod';

export const devicePlatformSchema = z.enum(['ios', 'android']);

export const deviceResponseSchema = z.object({
  id: z.string().uuid(),
  platform: devicePlatformSchema,
  push_token: z.string(),
  app_version: z.string().nullable(),
  last_seen_at: z.string(),
});
export type DeviceResponse = z.infer<typeof deviceResponseSchema>;

// F16: register/refresh a device's push token — the client calls this on
// login and on every app start (updates `last_seen_at`), so it doubles as
// an upsert keyed by (user_id, push_token).
export const registerDeviceBodySchema = z
  .object({
    platform: devicePlatformSchema,
    push_token: z.string().min(1).max(4096),
    app_version: z.string().max(40).optional(),
  })
  .strict();
export type RegisterDeviceBody = z.infer<typeof registerDeviceBodySchema>;

export const deviceIdParamsSchema = z.object({ id: z.string().uuid() });
