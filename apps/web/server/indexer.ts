import { parseEventLogs, type Log } from "viem";
import { BASE_SEPOLIA_CHAIN_ID } from "@eventpass/shared";
import { db } from "@/lib/db";
import { publicClient, ticketAbi, ticketAddress, verifyChainConfiguration } from "@/lib/chain";
const CHAIN=BASE_SEPOLIA_CHAIN_ID;
const CHECKPOINT_ID="base-sepolia-eventpass";
const CONFIRMATIONS=8n;
const CHUNK=64n;

async function rollbackTo(blockNumber:bigint, blockHash:string) {
  await db.$transaction(async tx=>{
    const orphaned=await tx.purchase.findMany({where:{chainId:CHAIN,blockNumber:{gt:blockNumber}},include:{ticket:{include:{checkIn:true}}}});
    for(const purchase of orphaned){if(purchase.ticket){if(purchase.ticket.checkIn)await tx.auditLog.create({data:{action:"REORG_CHECKIN_ORPHANED",targetType:"Ticket",targetId:purchase.ticket.id,detail:{txHash:purchase.txHash}}});await tx.qrCredential.deleteMany({where:{ticketId:purchase.ticket.id}});await tx.checkIn.deleteMany({where:{ticketId:purchase.ticket.id}});await tx.ticket.delete({where:{id:purchase.ticket.id}})}}
    await tx.purchase.deleteMany({where:{chainId:CHAIN,blockNumber:{gt:blockNumber}}});
    const removedLogs=await tx.indexedLog.findMany({where:{chainId:CHAIN,blockNumber:{gt:blockNumber}}});
    for(const log of removedLogs) await tx.transactionRecord.deleteMany({where:{chainId:CHAIN,txHash:log.txHash}});
    await tx.indexedLog.deleteMany({where:{chainId:CHAIN,blockNumber:{gt:blockNumber}}});
    await tx.indexedBlock.deleteMany({where:{chainId:CHAIN,blockNumber:{gt:blockNumber}}});
    const events=await tx.event.findMany({where:{chainId:CHAIN,contractEventId:{not:null}},select:{id:true,contractEventId:true}});
    for(const event of events){const remaining=await tx.indexedLog.findMany({where:{chainId:CHAIN,contractEventId:event.contractEventId},select:{eventName:true}});const created=remaining.some(x=>x.eventName==="EventCreated");const canceled=remaining.some(x=>x.eventName==="EventCanceled");const count=await tx.purchase.count({where:{eventId:event.id}});await tx.ticketType.update({where:{eventId:event.id},data:{soldCount:count}});await tx.event.update({where:{id:event.id},data:created?{status:canceled?"CANCELED":"ACTIVE"}:{status:"DRAFT",contractEventId:null,creationTxHash:null}});const tickets=await tx.ticket.findMany({where:{eventId:event.id},include:{checkIn:true}});for(const ticket of tickets){const refundLog=await tx.indexedLog.findFirst({where:{chainId:CHAIN,eventName:"TicketRefunded",tokenId:ticket.tokenId}});if(!refundLog){await tx.purchase.update({where:{id:ticket.purchaseId},data:{refundedAt:null}});if(!ticket.checkIn)await tx.ticket.update({where:{id:ticket.id},data:{status:"VALID"}})}}}
    await tx.syncCheckpoint.upsert({where:{id:CHECKPOINT_ID},create:{id:CHECKPOINT_ID,chainId:CHAIN,blockNumber,blockHash},update:{blockNumber,blockHash}});
    await tx.auditLog.create({data:{action:"CHAIN_REORG_ROLLBACK",targetType:"SyncCheckpoint",targetId:CHECKPOINT_ID,detail:{toBlock:blockNumber.toString()}}});
  });
}

async function ensureCanonical(startBlock:bigint) {
  const checkpoint=await db.syncCheckpoint.findUnique({where:{id:CHECKPOINT_ID}});
  if(!checkpoint){const baseline=await publicClient.getBlock({blockNumber:startBlock-1n});await db.indexedBlock.upsert({where:{chainId_blockNumber:{chainId:CHAIN,blockNumber:baseline.number}},create:{id:`${CHAIN}:${baseline.number}`,chainId:CHAIN,blockNumber:baseline.number,blockHash:baseline.hash},update:{blockHash:baseline.hash}});return startBlock-1n}
  const current=await publicClient.getBlock({blockNumber:checkpoint.blockNumber});
  if(current.hash.toLowerCase()===checkpoint.blockHash.toLowerCase())return checkpoint.blockNumber;
  const candidates=await db.indexedBlock.findMany({where:{chainId:CHAIN,blockNumber:{gte:checkpoint.blockNumber>128n?checkpoint.blockNumber-128n:0n,lt:checkpoint.blockNumber}},orderBy:{blockNumber:"desc"}});
  for(const candidate of candidates){const block=await publicClient.getBlock({blockNumber:candidate.blockNumber});if(block.hash.toLowerCase()===candidate.blockHash.toLowerCase()){await rollbackTo(candidate.blockNumber,candidate.blockHash);return candidate.blockNumber}}
  throw new Error("Reorganization exceeds the 128-block recovery window; manual review required");
}

export async function applyIndexedLog(log:Log, timestamp:Date) {
  if(log.logIndex===null||!log.transactionHash||!log.blockHash||log.blockNumber===null)return;
  const parsed=parseEventLogs({abi:ticketAbi,logs:[log],strict:true})[0];if(!parsed)return;
  const eventName=parsed.eventName; const args=parsed.args as {eventId:bigint;tokenId:bigint;referenceHash:string;organizer:string;buyer:string;price:bigint;maxSupply:bigint;fee:bigint;saleStart:bigint;saleEnd:bigint;startsAt:bigint;endsAt:bigint};
  const eventId="eventId" in args ? args.eventId : null;
  const tokenId="tokenId" in args ? args.tokenId : null;
  await db.$transaction(async tx=>{
    const inserted=await tx.indexedLog.createMany({data:{chainId:CHAIN,txHash:log.transactionHash!,logIndex:log.logIndex!,blockNumber:log.blockNumber!,blockHash:log.blockHash!,eventName,contractEventId:eventId,tokenId},skipDuplicates:true});
    if(inserted.count===0)return;
    if(eventName==="EventCreated"){
      const event=await tx.event.findUnique({where:{referenceHash:args.referenceHash},include:{ticketType:true,organizer:{include:{user:{include:{wallets:true}}}}}});
      if(!event)throw new Error(`No organizer draft matches onchain event ${args.eventId}`);
      if(!event.ticketType||event.organizer.user.wallets.every(w=>w.address!==args.organizer.toLowerCase())||event.ticketType.priceAtomic!==args.price||BigInt(event.ticketType.maxSupply)!==args.maxSupply||BigInt(Math.floor(event.saleStartsAt.getTime()/1000))!==args.saleStart||BigInt(Math.floor(event.saleEndsAt.getTime()/1000))!==args.saleEnd||BigInt(Math.floor(event.startsAt.getTime()/1000))!==args.startsAt||BigInt(Math.floor(event.endsAt.getTime()/1000))!==args.endsAt)throw new Error("Onchain event does not match the organizer draft");
      await tx.event.update({where:{id:event.id},data:{status:"ACTIVE",contractEventId:args.eventId,creationTxHash:log.transactionHash}});
      await tx.transactionRecord.upsert({where:{chainId_txHash_kind:{chainId:CHAIN,txHash:log.transactionHash!,kind:"EVENT_CREATED"}},create:{chainId:CHAIN,txHash:log.transactionHash!,eventId:event.id,kind:"EVENT_CREATED",status:"CONFIRMED",blockNumber:log.blockNumber!,blockHash:log.blockHash!},update:{status:"CONFIRMED",blockNumber:log.blockNumber!,blockHash:log.blockHash!}});
    }
    if(eventName==="TicketPurchased"){
      const event=await tx.event.findUnique({where:{chainId_contractEventId:{chainId:CHAIN,contractEventId:args.eventId}}});if(!event)throw new Error(`Purchase references unknown event ${args.eventId}`);
      const buyerWallet=args.buyer.toLowerCase();const wallet=await tx.walletAccount.findUnique({where:{address:buyerWallet}});
      const purchase=await tx.purchase.create({data:{eventId:event.id,buyerId:wallet?.userId,buyerWallet,chainId:CHAIN,txHash:log.transactionHash!,logIndex:log.logIndex!,amountAtomic:args.price,feeAtomic:args.fee,blockNumber:log.blockNumber!,blockHash:log.blockHash!,purchasedAt:timestamp}});
      await tx.ticket.create({data:{eventId:event.id,purchaseId:purchase.id,chainId:CHAIN,contractAddress:ticketAddress().toLowerCase(),tokenId:args.tokenId,ownerWallet:buyerWallet}});
      await tx.ticketType.update({where:{eventId:event.id},data:{soldCount:{increment:1}}});
      await tx.transactionRecord.upsert({where:{chainId_txHash_kind:{chainId:CHAIN,txHash:log.transactionHash!,kind:"PURCHASE"}},create:{chainId:CHAIN,txHash:log.transactionHash!,eventId:event.id,kind:"PURCHASE",status:"CONFIRMED",blockNumber:log.blockNumber!,blockHash:log.blockHash!},update:{status:"CONFIRMED",blockNumber:log.blockNumber!,blockHash:log.blockHash!}});
    }
    if(eventName==="EventCanceled"){const event=await tx.event.findUnique({where:{chainId_contractEventId:{chainId:CHAIN,contractEventId:args.eventId}}});if(event){await tx.event.update({where:{id:event.id},data:{status:"CANCELED"}});await tx.transactionRecord.upsert({where:{chainId_txHash_kind:{chainId:CHAIN,txHash:log.transactionHash!,kind:"EVENT_CANCELED"}},create:{chainId:CHAIN,txHash:log.transactionHash!,eventId:event.id,kind:"EVENT_CANCELED",status:"CONFIRMED",blockNumber:log.blockNumber!,blockHash:log.blockHash!},update:{status:"CONFIRMED",blockNumber:log.blockNumber!,blockHash:log.blockHash!}})}}
    if(eventName==="TicketRefunded"){
      const ticket=await tx.ticket.findUnique({where:{chainId_contractAddress_tokenId:{chainId:CHAIN,contractAddress:ticketAddress().toLowerCase(),tokenId:args.tokenId}}});
      if(ticket){await tx.ticket.update({where:{id:ticket.id},data:{status:"REFUNDED"}});await tx.purchase.update({where:{id:ticket.purchaseId},data:{refundedAt:timestamp}});await tx.transactionRecord.upsert({where:{chainId_txHash_kind:{chainId:CHAIN,txHash:log.transactionHash!,kind:"REFUND"}},create:{chainId:CHAIN,txHash:log.transactionHash!,eventId:ticket.eventId,kind:"REFUND",status:"CONFIRMED",blockNumber:log.blockNumber!,blockHash:log.blockHash!},update:{status:"CONFIRMED",blockNumber:log.blockNumber!,blockHash:log.blockHash!}})}
    }
    if(eventName==="ProceedsWithdrawn"||eventName==="PlatformFeeWithdrawn"){
      const event=await tx.event.findUnique({where:{chainId_contractEventId:{chainId:CHAIN,contractEventId:args.eventId}}});
      await tx.transactionRecord.upsert({where:{chainId_txHash_kind:{chainId:CHAIN,txHash:log.transactionHash!,kind:eventName}},create:{chainId:CHAIN,txHash:log.transactionHash!,eventId:event?.id,kind:eventName,status:"CONFIRMED",blockNumber:log.blockNumber!,blockHash:log.blockHash!},update:{status:"CONFIRMED",blockNumber:log.blockNumber!,blockHash:log.blockHash!}});
    }
  });
}

export async function indexConfirmedLogs() {
  await verifyChainConfiguration();
  const startText=process.env.INDEXER_START_BLOCK;
  if(!startText||!/^[1-9]\d*$/.test(startText))throw new Error("INDEXER_START_BLOCK must be the contract deployment block");
  const startBlock=BigInt(startText); const head=await publicClient.getBlockNumber();if(head<CONFIRMATIONS)return {processed:0,checkpoint:null};const safeHead=head-CONFIRMATIONS;
  const previous=await ensureCanonical(startBlock);if(previous>=safeHead)return {processed:0,checkpoint:previous.toString()};
  const fromBlock=previous+1n;const toBlock=fromBlock+CHUNK-1n<safeHead?fromBlock+CHUNK-1n:safeHead;
  const logs=await publicClient.getLogs({address:ticketAddress(),fromBlock,toBlock});
  const timestamps=new Map<string,Date>();
  for(const log of logs){const block=log.blockNumber!;const key=block.toString();if(!timestamps.has(key)){const data=await publicClient.getBlock({blockNumber:block});if(data.hash.toLowerCase()!==log.blockHash?.toLowerCase())throw new Error("Block changed during indexing; retry");timestamps.set(key,new Date(Number(data.timestamp)*1000));await db.indexedBlock.upsert({where:{chainId_blockNumber:{chainId:CHAIN,blockNumber:block}},create:{id:`${CHAIN}:${block}`,chainId:CHAIN,blockNumber:block,blockHash:data.hash},update:{blockHash:data.hash}})}await applyIndexedLog(log,timestamps.get(key)!)}
  const last=await publicClient.getBlock({blockNumber:toBlock});
  const touchedIds=(await db.indexedLog.findMany({where:{chainId:CHAIN,blockNumber:{gte:fromBlock,lte:toBlock}},select:{contractEventId:true}})).map(x=>x.contractEventId).filter((id):id is bigint=>id!==null);
  const touched=await db.event.findMany({where:{chainId:CHAIN,contractEventId:{in:touchedIds}},select:{id:true,contractEventId:true,ticketType:{select:{soldCount:true}}}});
  for(const event of touched){const [availability,financials,totals,refunds]=await Promise.all([publicClient.readContract({address:ticketAddress(),abi:ticketAbi,functionName:"eventAvailability",args:[event.contractEventId!],blockNumber:toBlock}),publicClient.readContract({address:ticketAddress(),abi:ticketAbi,functionName:"eventFinancials",args:[event.contractEventId!],blockNumber:toBlock}),db.purchase.aggregate({where:{eventId:event.id},_sum:{amountAtomic:true,feeAtomic:true}}),db.purchase.aggregate({where:{eventId:event.id,refundedAt:{not:null}},_sum:{amountAtomic:true}})]);if(Number(availability[2])!==event.ticketType?.soldCount||financials[0]!==(totals._sum.amountAtomic??0n)||financials[1]!==(totals._sum.feeAtomic??0n)||financials[2]!==(refunds._sum.amountAtomic??0n))throw new Error(`Onchain accounting mismatch for event ${event.id}; inspect index before continuing`)}
  if((await publicClient.getBlock({blockNumber:toBlock})).hash.toLowerCase()!==last.hash.toLowerCase())throw new Error("Block changed during reconciliation; retry");
  await db.$transaction(async tx=>{await tx.indexedBlock.upsert({where:{chainId_blockNumber:{chainId:CHAIN,blockNumber:toBlock}},create:{id:`${CHAIN}:${toBlock}`,chainId:CHAIN,blockNumber:toBlock,blockHash:last.hash},update:{blockHash:last.hash}});await tx.syncCheckpoint.createMany({data:{id:CHECKPOINT_ID,chainId:CHAIN,blockNumber:toBlock,blockHash:last.hash},skipDuplicates:true});await tx.syncCheckpoint.updateMany({where:{id:CHECKPOINT_ID,blockNumber:{lt:toBlock}},data:{blockNumber:toBlock,blockHash:last.hash}})});
  return {processed:logs.length,checkpoint:toBlock.toString(),safeHead:safeHead.toString()};
}
