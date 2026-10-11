import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { hash } from "@/lib/security";
import { authConfigured } from "@/server/config";
export const SESSION_COOKIE = "eventpass_session";
export async function currentSession() {
  if (!authConfigured()) return null;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({ where:{tokenHash:hash(token + process.env.SESSION_SECRET)}, include:{user:{include:{wallets:true,organizer:true}}} });
  if (!session || session.expiresAt <= new Date()) return null;
  return session;
}
export async function requireUser() { const session=await currentSession(); if (!session) throw new Error("UNAUTHORIZED"); return session.user; }
export async function requireOrganizer() { const user=await requireUser(); if (user.organizer?.status!=="APPROVED") throw new Error("FORBIDDEN"); return {user,organizer:user.organizer}; }
export async function requireAdmin() { const user=await requireUser(); const admins=(process.env.PLATFORM_ADMIN_WALLETS??"").split(",").map(value=>value.trim().toLowerCase()); if (user.role!=="PLATFORM_ADMIN" || !user.wallets.some(wallet=>admins.includes(wallet.address))) throw new Error("FORBIDDEN"); return user; }
export function authError(error: unknown) { if (error instanceof Error && error.message==="UNAUTHORIZED") return 401; if (error instanceof Error && error.message==="FORBIDDEN") return 403; return 500; }
