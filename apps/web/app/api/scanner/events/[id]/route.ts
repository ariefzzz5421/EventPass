import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authError, requireUser } from "@/server/auth";
import { failure } from "@/lib/security";
export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){try{const user=await requireUser();const {id}=await params;const event=await db.event.findUnique({where:{id},include:{organizer:true}});if(!event)return failure("Event not found",404);const authorized=event.organizer.userId===user.id||!!await db.staffPermission.findUnique({where:{eventId_userId:{eventId:id,userId:user.id}}});if(!authorized)return failure("Staff access required",403);return NextResponse.json({id:event.id,title:event.title,startsAt:event.startsAt.toISOString(),endsAt:event.endsAt.toISOString(),status:event.status},{headers:{"Cache-Control":"no-store"}})}catch(error){return failure("Unauthorized",authError(error))}}
