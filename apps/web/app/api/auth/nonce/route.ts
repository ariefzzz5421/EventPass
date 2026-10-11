import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { isAddress } from "viem";
import { BASE_SEPOLIA_CHAIN_ID } from "@eventpass/shared";
import { db } from "@/lib/db";
import { checkOrigin, failure, hash, rateLimit } from "@/lib/security";
import { authConfigured } from "@/server/config";
export async function POST(request: NextRequest) {
  const appUrl=process.env.NEXT_PUBLIC_APP_URL;
  if (!authConfigured()||!appUrl) return failure("Authentication is not configured",503);
  if (!checkOrigin(request)) return failure("Invalid request origin",403);
  const body = await request.json().catch(()=>null); const address=body?.address;
  if (typeof address!=="string" || !isAddress(address)) return failure("Invalid wallet address");
  if (!await rateLimit(request,"auth-nonce",10,60_000,address.toLowerCase())) return failure("Too many requests",429);
  const nonce = randomBytes(16).toString("hex");
  await db.authNonce.create({data:{nonceHash:hash(nonce),address:address.toLowerCase(),expiresAt:new Date(Date.now()+5*60_000)}});
  const url = new URL(appUrl);
  return NextResponse.json({nonce,domain:url.host,uri:url.origin,chainId:BASE_SEPOLIA_CHAIN_ID,expiresAt:new Date(Date.now()+5*60_000).toISOString()},{headers:{"Cache-Control":"no-store"}});
}
