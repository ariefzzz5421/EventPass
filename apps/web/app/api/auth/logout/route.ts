import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { SESSION_COOKIE } from "@/server/auth";
import { checkOrigin, failure, hash } from "@/lib/security";
export async function POST(request: NextRequest){ if(!checkOrigin(request)) return failure("Invalid request origin",403); const token=request.cookies.get(SESSION_COOKIE)?.value; if(token && process.env.SESSION_SECRET && process.env.DATABASE_URL) await db.session.deleteMany({where:{tokenHash:hash(token+process.env.SESSION_SECRET)}}); const response=NextResponse.json({ok:true}); response.cookies.delete(SESSION_COOKIE); return response; }
