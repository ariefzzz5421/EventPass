import { z } from "zod";
import { safeEqual, sign } from "@/lib/security";
const payloadSchema=z.object({v:z.literal(1),ticketId:z.string().min(1).max(40),eventId:z.string().min(1).max(40),tokenId:z.string().regex(/^\d+$/),owner:z.string().regex(/^0x[a-f0-9]{40}$/),nonce:z.string().regex(/^[a-f0-9]{32}$/),exp:z.number().int()});
export type QrPayload=z.infer<typeof payloadSchema>;
export function encodeCredential(payload:QrPayload,secret:string){const raw=Buffer.from(JSON.stringify(payload)).toString("base64url");return `${raw}.${sign(raw,secret)}`}
export function decodeCredential(credential:string,secret:string,now=Date.now()):QrPayload|null{if(credential.length>2048)return null;const [raw,mac,...extra]=credential.split(".");if(!raw||!mac||extra.length||!safeEqual(mac,sign(raw,secret)))return null;try{const parsed=payloadSchema.safeParse(JSON.parse(Buffer.from(raw,"base64url").toString("utf8")));if(!parsed.success||parsed.data.exp<=now||parsed.data.exp>now+90_000)return null;return parsed.data}catch{return null}}
