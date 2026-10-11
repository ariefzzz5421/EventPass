import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkOrigin, failure } from "@/lib/security";
import { authError, requireAdmin } from "@/server/auth";
import { publicClient, ticketAbi, ticketAddress, verifyChainConfiguration } from "@/lib/chain";
export async function POST(request:NextRequest,{params}:{params:Promise<{id:string}>}){
  if(!checkOrigin(request))return failure("Invalid request origin",403);
  try{
    const admin=await requireAdmin();
    const {id}=await params;
    const profile=await db.organizerProfile.findUnique({where:{id},include:{user:{include:{wallets:true}}}});
    if(!profile||profile.status!=="PENDING")return failure("Pending organizer not found",404);
    const address=profile.user.wallets[0]?.address;
    if(!address)return failure("Organizer has no wallet",409);
    await verifyChainConfiguration();
    const role=await publicClient.readContract({address:ticketAddress(),abi:ticketAbi,functionName:"ORGANIZER_ROLE"});
    const granted=await publicClient.readContract({address:ticketAddress(),abi:ticketAbi,functionName:"hasRole",args:[role,address as `0x${string}`]});
    if(!granted)return failure("Confirm the onchain organizer role before approving the profile",409);
    const updated=await db.$transaction(async tx=>{
      const result=await tx.organizerProfile.updateMany({where:{id,status:"PENDING"},data:{status:"APPROVED"}});
      if(result.count!==1)throw new Error("Approval already processed");
      await tx.auditLog.create({data:{actorId:admin.id,action:"ORGANIZER_APPROVED",targetType:"OrganizerProfile",targetId:id}});
      return tx.organizerProfile.findUniqueOrThrow({where:{id}});
    });
    return NextResponse.json({id:updated.id,status:updated.status,address});
  }catch(error){return failure("Unable to approve organizer",authError(error))}
}
