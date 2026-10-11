import { z } from "zod";
const authSchema=z.object({
  DATABASE_URL:z.string().url(),
  SESSION_SECRET:z.string().min(32),
  NEXT_PUBLIC_APP_URL:z.string().url(),
});
const qrSchema=z.object({QR_SIGNING_SECRET:z.string().min(32)});
export function authConfigured(){return authSchema.safeParse(process.env).success}
export function qrConfigured(){return qrSchema.safeParse(process.env).success}
