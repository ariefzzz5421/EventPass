"use client";
import { useCallback, useEffect, useState } from "react";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { formatUsdc } from "@eventpass/shared";
import { ticketAbi, ticketAddress } from "@/lib/chain";
import { WalletAccess } from "@/components/wallet-access";

type Pending = { id:string; name:string; address:string; createdAt:string };
type Overview = { events:number; organizers:number; ticketsSold:number; grossAtomic:string; feesAtomic:string; refundedAtomic:string; pending:Pending[]; settleable:{id:string;title:string;contractEventId:string}[] };

export function AdminClient() {
  return <WalletAccess>{user=>user.role==="PLATFORM_ADMIN"?<Admin/>:<div className="status-line error">Platform admin access required.</div>}</WalletAccess>;
}

function Admin() {
  const [data,setData]=useState<Overview|null>(null);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);
  const {address}=useAccount();
  const client=usePublicClient();
  const {writeContractAsync}=useWriteContract();
  const load=useCallback(async()=>{
    try {
      const response=await fetch("/api/admin/overview",{cache:"no-store"});
      const result=await response.json();
      if(!response.ok)throw new Error(result.error);
      setData(result);
      setError("");
    } catch(cause) { setError(cause instanceof Error?cause.message:"Admin data unavailable"); }
  },[]);
  useEffect(()=>{void load()},[load]);

  async function approve(item:Pending) {
    if(!client||!address)return;
    setBusy(true);setError("");setMessage("");
    try {
      const adminRole=await client.readContract({address:ticketAddress(),abi:ticketAbi,functionName:"DEFAULT_ADMIN_ROLE"});
      const isAdmin=await client.readContract({address:ticketAddress(),abi:ticketAbi,functionName:"hasRole",args:[adminRole,address]});
      if(!isAdmin)throw new Error("Connected wallet is not an onchain contract administrator.");
      const role=await client.readContract({address:ticketAddress(),abi:ticketAbi,functionName:"ORGANIZER_ROLE"});
      const hasRole=await client.readContract({address:ticketAddress(),abi:ticketAbi,functionName:"hasRole",args:[role,item.address as `0x${string}`]});
      if(!hasRole) {
        setMessage("Confirm the organizer role grant in your wallet.");
        const hash=await writeContractAsync({address:ticketAddress(),abi:ticketAbi,functionName:"grantRole",args:[role,item.address as `0x${string}`]});
        setMessage("Waiting for eight confirmations before approving the profile…");
        const receipt=await client.waitForTransactionReceipt({hash,confirmations:8});
        if(receipt.status!=="success")throw new Error("Onchain role grant reverted.");
      }
      const response=await fetch(`/api/admin/organizers/${item.id}/approve`,{method:"POST"});
      const result=await response.json();
      if(!response.ok)throw new Error(result.error);
      setMessage(`${item.name} approved in the app and onchain.`);
      await load();
    } catch(cause) {setError(cause instanceof Error?cause.message:"Approval failed");}
    finally {setBusy(false);}
  }
  async function withdrawFee(event:{id:string;title:string;contractEventId:string}) {
    if(!client||!address)return;
    setBusy(true);setError("");setMessage("");
    try {
      const adminRole=await client.readContract({address:ticketAddress(),abi:ticketAbi,functionName:"DEFAULT_ADMIN_ROLE"});
      if(!await client.readContract({address:ticketAddress(),abi:ticketAbi,functionName:"hasRole",args:[adminRole,address]}))throw new Error("Connected wallet is not an onchain contract administrator.");
      const due=await client.readContract({address:ticketAddress(),abi:ticketAbi,functionName:"settlementAvailable",args:[BigInt(event.contractEventId)]});
      if(due[1]===0n)throw new Error("No platform fee is currently available for this event.");
      const hash=await writeContractAsync({address:ticketAddress(),abi:ticketAbi,functionName:"withdrawPlatformFees",args:[BigInt(event.contractEventId)]});
      setMessage("Waiting for fee withdrawal confirmation…");
      const receipt=await client.waitForTransactionReceipt({hash,confirmations:8});
      if(receipt.status!=="success")throw new Error("Fee withdrawal reverted.");
      setMessage(`Platform fee sent to the contract treasury for ${event.title}. Reporting updates after indexing.`);
    } catch(cause) {setError(cause instanceof Error?cause.message:"Fee withdrawal failed");}
    finally {setBusy(false);}
  }
  if(!data)return <div className="panel">{error||"Loading platform metrics…"}</div>;
  return <div>
    <div className="stats-grid" style={{marginBottom:24}}>
      <div className="stat"><span>Live events</span><strong>{data.events}</strong></div>
      <div className="stat"><span>Organizers</span><strong>{data.organizers}</strong></div>
      <div className="stat"><span>Tickets sold</span><strong>{data.ticketsSold}</strong></div>
      <div className="stat"><span>Gross USDC</span><strong>{formatUsdc(data.grossAtomic)}</strong></div>
      <div className="stat"><span>Platform fees</span><strong>{formatUsdc(data.feesAtomic)}</strong></div>
      <div className="stat"><span>Refunded USDC</span><strong>{formatUsdc(data.refundedAtomic)}</strong></div>
    </div>
    <div className="panel"><h2>Organizer applications</h2>{data.pending.length?<div className="table-wrap"><table className="table"><thead><tr><th>Organizer</th><th>Wallet</th><th>Applied</th><th/></tr></thead><tbody>{data.pending.map(item=><tr key={item.id}><td>{item.name}</td><td>{item.address}</td><td>{new Date(item.createdAt).toLocaleDateString()}</td><td><button className="button button-primary button-small" disabled={busy} onClick={()=>void approve(item)}>Approve + grant role</button></td></tr>)}</tbody></table></div>:<p className="muted">No pending applications.</p>}</div>
    <div className="panel" style={{marginTop:20}}><h2>Platform fee settlement</h2><p className="body-copy">Fees from completed, uncanceled events can be sent to the contract&apos;s fixed treasury address. Availability is checked onchain before signing.</p>{data.settleable.length?<div className="table-wrap"><table className="table"><thead><tr><th>Event</th><th>Contract event</th><th/></tr></thead><tbody>{data.settleable.map(event=><tr key={event.id}><td>{event.title}</td><td>#{event.contractEventId}</td><td><button className="button button-outline button-small" disabled={busy} onClick={()=>void withdrawFee(event)}>Withdraw available fee</button></td></tr>)}</tbody></table></div>:<p className="muted">No completed events are ready for fee settlement.</p>}</div>
    {message&&<p className="status-line success" style={{marginTop:16}}>{message}</p>}
    {error&&<p className="status-line error" style={{marginTop:16}}>{error}</p>}
  </div>;
}
