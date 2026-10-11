import { NextRequest, NextResponse } from "next/server";
import { indexConfirmedLogs } from "@/server/indexer";
import { safeEqual, failure } from "@/lib/security";
export const maxDuration=60;
export async function GET(request:NextRequest){const secret=process.env.CRON_SECRET;const supplied=request.headers.get("authorization")?.replace(/^Bearer /,"")??"";if(!secret||!safeEqual(secret,supplied))return failure("Unauthorized",401);if(!process.env.DATABASE_URL||!process.env.NEXT_PUBLIC_EVENT_TICKET_ADDRESS)return failure("Indexer not configured",503);try{return NextResponse.json(await indexConfirmedLogs(),{headers:{"Cache-Control":"no-store"}})}catch(error){return failure(error instanceof Error?error.message:"Indexer failed",503)}}
