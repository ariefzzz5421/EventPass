import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { eventAnalytics } from "@/server/analytics";
import { authError, requireOrganizer } from "@/server/auth";
import { failure } from "@/lib/security";
export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){try{const {organizer}=await requireOrganizer();const {id}=await params;const owns=await db.event.count({where:{id,organizerId:organizer.id}});if(!owns)return failure("Event not found",404);return NextResponse.json(await eventAnalytics(id),{headers:{"Cache-Control":"no-store"}})}catch(error){return failure("Analytics unavailable",authError(error))}}
