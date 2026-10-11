import { NextRequest, NextResponse } from "next/server";
import { SiweMessage } from "siwe";
import { BASE_SEPOLIA_CHAIN_ID } from "@eventpass/shared";
import { db } from "@/lib/db";
import { SESSION_COOKIE } from "@/server/auth";
import { checkOrigin, failure, hash, randomToken, rateLimit } from "@/lib/security";
import { authConfigured } from "@/server/config";
export async function POST(request: NextRequest) {
  const appUrl=process.env.NEXT_PUBLIC_APP_URL;
  if (!authConfigured()||!appUrl) return failure("Authentication is not configured",503);
  if (!checkOrigin(request)) return failure("Invalid request origin",403);
  if (!await rateLimit(request,"auth-verify",10,60_000)) return failure("Too many requests",429);
  const body = await request.json().catch(()=>null);
  if (typeof body?.message!=="string" || typeof body?.signature!=="string" || body.message.length>3000) return failure("Invalid signed message");
  try {
    const message = new SiweMessage(body.message);
    const url = new URL(appUrl);
    if (message.domain!==url.host || message.uri!==url.origin || message.chainId!==BASE_SEPOLIA_CHAIN_ID) return failure("Wrong sign-in domain or network",403);
    const verified = await message.verify({ signature:body.signature, domain:url.host, nonce:message.nonce });
    if (!verified.success) return failure("Signature verification failed",401);
    const address=message.address.toLowerCase(); const nonceHash=hash(message.nonce); const now=new Date();
    const token=randomToken(); const admins=(process.env.PLATFORM_ADMIN_WALLETS??"").split(",").map(x=>x.trim().toLowerCase());
    await db.$transaction(async tx => {
      const consumed=await tx.authNonce.updateMany({where:{nonceHash,address,expiresAt:{gt:now},consumedAt:null},data:{consumedAt:now}});
      if (consumed.count!==1) throw new Error("NONCE_REPLAY");
      const wallet=await tx.walletAccount.findUnique({where:{address}});
      const user=wallet ? await tx.user.findUniqueOrThrow({where:{id:wallet.userId}}) : await tx.user.create({data:{wallets:{create:{address}}}});
      if (admins.includes(address) && user.role!=="PLATFORM_ADMIN") await tx.user.update({where:{id:user.id},data:{role:"PLATFORM_ADMIN"}});
      await tx.session.create({data:{tokenHash:hash(token+process.env.SESSION_SECRET),userId:user.id,expiresAt:new Date(Date.now()+7*24*60*60_000)}});
    });
    const response=NextResponse.json({ok:true});
    response.cookies.set(SESSION_COOKIE,token,{httpOnly:true,secure:url.protocol==="https:",sameSite:"lax",path:"/",maxAge:7*24*60*60});
    return response;
  } catch (error) { return failure(error instanceof Error && error.message==="NONCE_REPLAY" ? "Nonce expired or already used" : "Invalid signature",401); }
}
