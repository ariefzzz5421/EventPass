import { z } from "zod";
export const addressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/);
const bannerUrl=z.string().url().refine(value=>{try{const url=new URL(value);return url.protocol==="https:"&&url.hostname.endsWith(".public.blob.vercel-storage.com")}catch{return false}},{message:"Use an uploaded EventPass banner"});
export const eventInput = z.object({
  title:z.string().trim().min(4).max(120),description:z.string().trim().min(20).max(10_000),
  category:z.enum(["Music","Art","Technology","Community","Sports","Other"]),
  venue:z.string().trim().min(2).max(150),city:z.string().trim().min(2).max(100),
  startsAt:z.coerce.date(),endsAt:z.coerce.date(),saleStartsAt:z.coerce.date(),saleEndsAt:z.coerce.date(),
  priceUsdc:z.string(),maxSupply:z.number().int().min(1).max(100_000),bannerUrl:bannerUrl.optional(),
}).refine(x=>x.saleStartsAt<x.saleEndsAt && x.saleEndsAt<=x.startsAt && x.startsAt<x.endsAt,{message:"Sale and event dates must be in order"});
export const eventMetadataInput=z.object({title:z.string().trim().min(4).max(120),description:z.string().trim().min(20).max(10_000),category:z.enum(["Music","Art","Technology","Community","Sports","Other"]),venue:z.string().trim().min(2).max(150),city:z.string().trim().min(2).max(100),bannerUrl:bannerUrl.nullable().optional()});
