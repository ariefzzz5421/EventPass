"use client";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useAccount, useConnect, useDisconnect, useSignMessage, useSwitchChain } from "wagmi";
import { SiweMessage } from "siwe";
import { baseSepolia } from "@/lib/network";
import { AlertCircle, CheckCircle2, Wallet } from "lucide-react";
type SessionUser = {id:string;role:"CUSTOMER"|"PLATFORM_ADMIN";address:string;organizer:{id:string;status:string;name:string}|null};
export function WalletAccess({children}:{children:(user:SessionUser)=>ReactNode}) {
  const {address,isConnected,chainId}=useAccount(); const {connectAsync,connectors,isPending:connecting}=useConnect(); const {disconnect}=useDisconnect(); const {signMessageAsync}=useSignMessage(); const {switchChainAsync}=useSwitchChain();
  const [user,setUser]=useState<SessionUser|null>(null); const [loading,setLoading]=useState(true); const [busy,setBusy]=useState(false); const [error,setError]=useState("");
  const refresh=useCallback(async()=>{try{const res=await fetch("/api/auth/me",{cache:"no-store"});const data=await res.json();setUser(data.authenticated?data.user:null)}catch{setUser(null)}finally{setLoading(false)}},[]);
  useEffect(()=>{void refresh()},[refresh]);
  async function connectWallet(connector:typeof connectors[number]){setError("");try{await connectAsync({connector})}catch(cause){setError(cause instanceof Error?cause.message:"Wallet connection failed")}}
  async function signIn(){if(!address)return;setBusy(true);setError("");try{
    if(chainId!==baseSepolia.id) await switchChainAsync({chainId:baseSepolia.id});
    const nonceRes=await fetch("/api/auth/nonce",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({address})});const nonceData=await nonceRes.json();if(!nonceRes.ok)throw new Error(nonceData.error);
    const message=new SiweMessage({domain:nonceData.domain,address,statement:"Sign in to EventPass. This does not spend funds.",uri:nonceData.uri,version:"1",chainId:baseSepolia.id,nonce:nonceData.nonce,issuedAt:new Date().toISOString(),expirationTime:nonceData.expiresAt});
    const messageText=message.prepareMessage();const signature=await signMessageAsync({message:messageText});
    const verified=await fetch("/api/auth/verify",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:messageText,signature})});const data=await verified.json();if(!verified.ok)throw new Error(data.error);await refresh();
  }catch(e){setError(e instanceof Error?e.message:"Sign-in failed")}finally{setBusy(false)}}
  async function signOut(){await fetch("/api/auth/logout",{method:"POST"});setUser(null);disconnect()}
  if(!isConnected) return <div className="panel"><Wallet size={28} color="#8ea6ff"/><h2>Connect your wallet</h2><p className="body-copy">Use a compatible EVM wallet to continue on Base Sepolia.</p><div className="form-actions">{connectors.map(connector=><button key={connector.uid} className="button button-primary" disabled={connecting} onClick={()=>void connectWallet(connector)}>{connecting?"Connecting…":`Connect ${connector.name}`}</button>)}</div>{error&&<p className="status-line error"><AlertCircle size={16}/>{error}</p>}</div>;
  if(chainId!==baseSepolia.id) return <div className="panel"><h2>Switch to Base Sepolia</h2><p className="body-copy">This staging app only accepts testnet transactions.</p><button className="button button-primary" onClick={()=>switchChainAsync({chainId:baseSepolia.id}).catch(e=>setError(e.message))}>Switch network</button>{error&&<p className="status-line error">{error}</p>}</div>;
  if(loading) return <div className="panel">Checking your session…</div>;
  if(!user || user.address?.toLowerCase()!==address?.toLowerCase()) return <div className="panel"><h2>Sign in with your wallet</h2><p className="body-copy">Connecting a wallet does not grant app access. Sign a free message to verify you own {address?.slice(0,6)}…{address?.slice(-4)}.</p><button className="button button-primary" disabled={busy} onClick={signIn}>{busy?"Waiting for signature…":"Sign in"}</button>{error&&<p className="status-line error" style={{marginTop:15}}><AlertCircle size={16}/>{error}</p>}</div>;
  return <><div className="status-line" style={{marginBottom:20,justifyContent:"space-between"}}><span><CheckCircle2 size={15} style={{display:"inline",verticalAlign:"middle"}}/> Signed in as {address?.slice(0,6)}…{address?.slice(-4)}</span><button className="button button-small button-ghost" onClick={signOut}>Sign out</button></div>{children(user)}</>;
}
