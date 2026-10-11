import { NextResponse } from "next/server";
import { currentSession } from "@/server/auth";
export async function GET(){ const session=await currentSession(); return NextResponse.json(session ? { authenticated:true, user:{ id:session.user.id, role:session.user.role, address:session.user.wallets[0]?.address, organizer:session.user.organizer ? {id:session.user.organizer.id,status:session.user.organizer.status,name:session.user.organizer.name}:null }} : { authenticated:false },{headers:{"Cache-Control":"no-store"}}); }
