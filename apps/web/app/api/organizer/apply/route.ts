import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, authError } from "@/server/auth";
import { db } from "@/lib/db";
import { checkOrigin, failure, rateLimit } from "@/lib/security";
const schema=z.object({name:z.string().trim().min(3).max(100),bio:z.string().trim().max(1000).optional()});
export async function POST(request:NextRequest){if(!checkOrigin(request))return failure("Invalid request origin",403);try{const user=await requireUser();if(!await rateLimit(request,"organizer-apply",3,60*60_000,user.id))return failure("Too many requests",429);const input=schema.safeParse(await request.json());if(!input.success)return failure("Invalid organizer profile");const wallet=user.wallets[0];if(!wallet)return failure("Wallet required",400);const profile=await db.organizerProfile.upsert({where:{userId:user.id},create:{userId:user.id,name:input.data.name,bio:input.data.bio,payoutWallet:wallet.address},update:{name:input.data.name,bio:input.data.bio}});await db.auditLog.create({data:{actorId:user.id,action:"ORGANIZER_APPLICATION",targetType:"OrganizerProfile",targetId:profile.id}});return NextResponse.json({id:profile.id,status:profile.status})}catch(error){return failure("Unable to apply",authError(error))}}
