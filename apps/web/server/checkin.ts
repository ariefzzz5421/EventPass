import { db } from "@/lib/db";
import { hash } from "@/lib/security";
export async function redeemAtomically(input:{ticketId:string;nonce:string;staffId:string;eventId:string;tokenId:string;now:Date}){
  return db.$transaction(async tx=>{
    const nonce=await tx.qrCredential.updateMany({where:{nonceHash:hash(input.nonce),ticketId:input.ticketId,usedAt:null,expiresAt:{gt:input.now}},data:{usedAt:input.now}});
    if(nonce.count!==1)throw new Error("QR_REPLAY");
    const updated=await tx.ticket.updateMany({where:{id:input.ticketId,status:"VALID"},data:{status:"USED"}});
    if(updated.count!==1)throw new Error("DUPLICATE_CHECKIN");
    const checkIn=await tx.checkIn.create({data:{ticketId:input.ticketId,staffId:input.staffId,checkedAt:input.now}});
    await tx.auditLog.create({data:{actorId:input.staffId,action:"TICKET_CHECKED_IN",targetType:"Ticket",targetId:input.ticketId,detail:{eventId:input.eventId,tokenId:input.tokenId}}});
    return checkIn;
  });
}
