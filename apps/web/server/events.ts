import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
export type PublicEvent = Awaited<ReturnType<typeof listEvents>>[number];
export async function listEvents(filters: { q?: string; category?: string; city?: string; date?: string; maxPrice?: string } = {}) {
  if (!process.env.DATABASE_URL) return [];
  const where: Prisma.EventWhereInput = { status: "ACTIVE", contractEventId: { not: null } };
  if (filters.q) where.OR = [{ title: { contains: filters.q, mode: "insensitive" } }, { description: { contains: filters.q, mode: "insensitive" } }];
  if (filters.category) where.category = filters.category;
  if (filters.city) where.city = { contains: filters.city, mode: "insensitive" };
  if (filters.date === "upcoming") where.startsAt = { gte: new Date() };
  if (filters.maxPrice && /^\d+$/.test(filters.maxPrice)) where.ticketType = { priceAtomic: { lte: BigInt(filters.maxPrice) * 1_000_000n } };
  return db.event.findMany({ where, select: { id:true,slug:true,title:true,category:true,venue:true,city:true,startsAt:true,endsAt:true,bannerUrl:true,status:true,contractEventId:true,chainId:true,organizer:{select:{name:true}},ticketType:{select:{priceAtomic:true,maxSupply:true,soldCount:true}} }, orderBy: { startsAt:"asc" }, take: 24 });
}
export async function getEvent(slug: string) { if (!process.env.DATABASE_URL) return null; return db.event.findFirst({ where: { slug, status:"ACTIVE", contractEventId:{not:null} }, include: { organizer: { select: { name:true,bio:true,payoutWallet:true } }, ticketType:true } }); }
