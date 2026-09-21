import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { devices } from '../../db/schema.js';
import type { Clock } from '../../lib/clock.js';
import { NotFoundError } from '../../lib/errors.js';
import type { RegisterDeviceBody, DeviceResponse } from './devices.schemas.js';

export class DevicesService {
  constructor(
    private db: Db,
    private clock: Clock,
  ) {}

  async register(userId: string, body: RegisterDeviceBody): Promise<DeviceResponse> {
    const now = this.clock.now();
    const [row] = await this.db
      .insert(devices)
      .values({
        userId,
        platform: body.platform,
        pushToken: body.push_token,
        appVersion: body.app_version ?? null,
        lastSeenAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [devices.userId, devices.pushToken],
        set: {
          platform: body.platform,
          appVersion: body.app_version ?? null,
          lastSeenAt: now,
          updatedAt: now,
        },
      })
      .returning();
    return toDeviceResponse(row!);
  }

  async delete(userId: string, id: string): Promise<void> {
    const rows = await this.db
      .select({ id: devices.id })
      .from(devices)
      .where(and(eq(devices.id, id), eq(devices.userId, userId)))
      .limit(1);
    if (rows.length === 0) throw new NotFoundError('Device not found.');
    await this.db.delete(devices).where(eq(devices.id, id));
  }

  // Used by NotificationService to clean up a token FCM reports as invalid
  // (F16). Not user-facing — no 404 needed if it's already gone.
  async deleteByToken(userId: string, pushToken: string): Promise<void> {
    await this.db
      .delete(devices)
      .where(and(eq(devices.userId, userId), eq(devices.pushToken, pushToken)));
  }

  async listActive(userId: string) {
    return this.db.select().from(devices).where(eq(devices.userId, userId));
  }
}

function toDeviceResponse(row: typeof devices.$inferSelect): DeviceResponse {
  return {
    id: row.id,
    platform: row.platform,
    push_token: row.pushToken,
    app_version: row.appVersion,
    last_seen_at: row.lastSeenAt.toISOString(),
  };
}
