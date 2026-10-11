"use client";
import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createConfig, http, WagmiProvider } from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";
import { baseSepolia } from "@/lib/network";
const projectId=process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
const connectors=projectId ? [injected(),walletConnect({projectId,showQrModal:true})] : [injected()];
const config=createConfig({chains:[baseSepolia],connectors,transports:{[baseSepolia.id]:http("https://sepolia.base.org")},ssr:true});
export function WalletProviders({children}:{children:ReactNode}) { const [queryClient]=useState(()=>new QueryClient()); return <WagmiProvider config={config}><QueryClientProvider client={queryClient}>{children}</QueryClientProvider></WagmiProvider>; }
