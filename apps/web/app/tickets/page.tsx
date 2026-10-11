import type { Metadata } from "next";
import { WalletProviders } from "@/components/wallet-providers";
import { TicketsClient } from "@/components/tickets-client";
export const metadata:Metadata={title:"My tickets"};
export default function TicketsPage(){return <main className="page container"><div className="page-heading"><span className="eyebrow">YOUR MOMENTS</span><h1>My tickets</h1><p>Your tickets appear after confirmed transactions are indexed. Ownership is checked on Base Sepolia each time you open this page.</p></div><WalletProviders><TicketsClient/></WalletProviders></main>}
