import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
export const hash = (value: string) => createHash("sha256").update(value).digest("hex");
export const randomToken = () => randomBytes(32).toString("base64url");
export function sign(value: string, secret: string) { return createHmac("sha256", secret).update(value).digest("base64url"); }
export function safeEqual(a: string, b: string) { const left=Buffer.from(a),right=Buffer.from(b); return left.length===right.length && timingSafeEqual(left,right); }
export function failure(message: string, status=400) { return NextResponse.json({ error:message }, { status }); }
export function checkOrigin(request: NextRequest) { const origin=request.headers.get("origin"); const expected=process.env.NEXT_PUBLIC_APP_URL; if(!origin||!expected)return false;try{return new URL(origin).origin===new URL(expected).origin}catch{return false} }
export async function rateLimit(request: NextRequest, scope: string, max: number, windowMs: number, identity?: string) {
  const ip = request.headers.get("x-vercel-forwarded-for") ?? request.headers.get("x-real-ip") ?? "unknown";
  const bucket = Math.floor(Date.now()/windowMs);
  const id = hash(`${scope}:${identity ?? ip}:${bucket}`);
  const row = await db.rateLimitBucket.upsert({ where:{id}, create:{id,count:1,expiresAt:new Date((bucket+1)*windowMs)}, update:{count:{increment:1}} });
  return row.count <= max;
}
