import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { SiweMessage } from "siwe";
import { privateKeyToAccount } from "viem/accounts";
import { encodeAbiParameters, encodeEventTopics, type Log } from "viem";
import { db } from "@/lib/db";
import { ticketAbi } from "@/lib/chain";
import { hash } from "@/lib/security";
import { applyIndexedLog } from "@/server/indexer";
import { redeemAtomically } from "@/server/checkin";
import { POST as noncePost } from "@/app/api/auth/nonce/route";
import { POST as verifyPost } from "@/app/api/auth/verify/route";
const enabled=!!process.env.DATABASE_URL;
const contract="0x2222222222222222222222222222222222222222" as const;
const buyer="0x1111111111111111111111111111111111111111" as const;
const fixtureEvents:string[]=[];
const fixtureUsers:string[]=[];
const fixtureTxHashes:string[]=[];
function request(url:string,body:unknown){return new NextRequest(url,{method:"POST",headers:{origin:"http://localhost:3000","content-type":"application/json"},body:JSON.stringify(body)})}
describe.skipIf(!enabled)("PostgreSQL integration",()=>{
  afterAll(async()=>{
    for(const eventId of fixtureEvents){
      await db.checkIn.deleteMany({where:{ticket:{eventId}}});
      await db.qrCredential.deleteMany({where:{ticket:{eventId}}});
      await db.ticket.deleteMany({where:{eventId}});
      await db.purchase.deleteMany({where:{eventId}});
      await db.staffPermission.deleteMany({where:{eventId}});
      await db.transactionRecord.deleteMany({where:{eventId}});
      await db.event.delete({where:{id:eventId}});
    }
    await db.indexedLog.deleteMany({where:{txHash:{in:fixtureTxHashes}}});
    await db.organizerProfile.deleteMany({where:{userId:{in:fixtureUsers}}});
    await db.user.deleteMany({where:{id:{in:fixtureUsers}}});
  });
  it("authenticates a SIWE signature and rejects nonce replay",async()=>{
    process.env.NEXT_PUBLIC_APP_URL="http://localhost:3000";process.env.SESSION_SECRET="test-session-secret-longer-than-thirty-two-chars";
    const account=privateKeyToAccount(`0x${"1".repeat(64)}`);const nonceResponse=await noncePost(request("http://localhost:3000/api/auth/nonce",{address:account.address}));expect(nonceResponse.status).toBe(200);const nonce=await nonceResponse.json();const message=new SiweMessage({domain:"localhost:3000",address:account.address,statement:"Sign in to EventPass. This does not spend funds.",uri:"http://localhost:3000",version:"1",chainId:84532,nonce:nonce.nonce,issuedAt:new Date().toISOString(),expirationTime:nonce.expiresAt}).prepareMessage();const signature=await account.signMessage({message});const body={message,signature};const first=await verifyPost(request("http://localhost:3000/api/auth/verify",body));expect(first.status).toBe(200);const repeat=await verifyPost(request("http://localhost:3000/api/auth/verify",body));expect(repeat.status).toBe(401);
  });
  it("indexes each purchase once, applies refund, and admits only once under a race",async()=>{
    process.env.NEXT_PUBLIC_EVENT_TICKET_ADDRESS=contract;
    const unique=randomUUID();const organizer=await db.user.create({data:{wallets:{create:{address:`0x${randomUUID().replaceAll("-","").padEnd(40,"0").slice(0,40)}`}}}});fixtureUsers.push(organizer.id);const profile=await db.organizerProfile.create({data:{userId:organizer.id,name:"Test Organizer",status:"APPROVED",payoutWallet:contract}});
    const event=await db.event.create({data:{slug:`integration-${unique}`,organizerId:profile.id,title:"Integration Event",description:"A test event with a real database transaction.",category:"Technology",venue:"Test Hall",city:"Jakarta",startsAt:new Date(Date.now()-60_000),endsAt:new Date(Date.now()+60_000),saleStartsAt:new Date(Date.now()-3_600_000),saleEndsAt:new Date(Date.now()-120_000),status:"DRAFT",contractEventId:BigInt(`0x${unique.replaceAll("-","").slice(0,12)}`),ticketType:{create:{priceAtomic:25_000_000n,maxSupply:10}}}});fixtureEvents.push(event.id);
    const eventId=event.contractEventId!;const tokenId=BigInt(`0x${unique.replaceAll("-","").slice(12,24)}`);const txHash=`0x${unique.replaceAll("-","").padEnd(64,"a")}` as const;fixtureTxHashes.push(txHash,`0x${unique.replaceAll("-","").padEnd(64,"d")}`);const blockHash=`0x${unique.replaceAll("-","").padEnd(64,"b")}` as const;const purchaseLog={address:contract,topics:encodeEventTopics({abi:ticketAbi,eventName:"TicketPurchased",args:{eventId,tokenId,buyer}}),data:encodeAbiParameters([{type:"uint256"},{type:"uint256"}],[25_000_000n,500_000n]),blockNumber:100n,blockHash,transactionHash:txHash,transactionIndex:0,logIndex:0,removed:false} as Log;
    await applyIndexedLog(purchaseLog,new Date());await applyIndexedLog(purchaseLog,new Date());expect(await db.purchase.count({where:{eventId:event.id}})).toBe(1);expect((await db.ticketType.findUniqueOrThrow({where:{eventId:event.id}})).soldCount).toBe(1);
    const ticket=await db.ticket.findFirstOrThrow({where:{eventId:event.id}});const staff=await db.user.create({data:{}});fixtureUsers.push(staff.id);const nonce=randomUUID().replaceAll("-","");await db.qrCredential.create({data:{nonceHash:hash(nonce),ticketId:ticket.id,expiresAt:new Date(Date.now()+60_000)}});const input={ticketId:ticket.id,nonce,staffId:staff.id,eventId:event.id,tokenId:tokenId.toString(),now:new Date()};const settled=await Promise.allSettled([redeemAtomically(input),redeemAtomically(input)]);expect(settled.filter(x=>x.status==="fulfilled")).toHaveLength(1);expect(await db.checkIn.count({where:{ticketId:ticket.id}})).toBe(1);
    const refundLog={address:contract,topics:encodeEventTopics({abi:ticketAbi,eventName:"TicketRefunded",args:{eventId,tokenId,buyer}}),data:encodeAbiParameters([{type:"uint256"}],[25_000_000n]),blockNumber:101n,blockHash:`0x${unique.replaceAll("-","").padEnd(64,"c")}`,transactionHash:`0x${unique.replaceAll("-","").padEnd(64,"d")}`,transactionIndex:0,logIndex:0,removed:false} as Log;await applyIndexedLog(refundLog,new Date());expect((await db.ticket.findUniqueOrThrow({where:{id:ticket.id}})).status).toBe("REFUNDED");expect((await db.purchase.findFirstOrThrow({where:{eventId:event.id}})).refundedAt).not.toBeNull();
  });
});
