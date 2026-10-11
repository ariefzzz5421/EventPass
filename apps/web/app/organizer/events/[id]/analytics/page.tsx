import { OrganizerNav } from "@/components/organizer-nav";
import { WalletProviders } from "@/components/wallet-providers";
import { AnalyticsClient } from "@/components/analytics-client";
export default async function EventAnalyticsPage({params}:{params:Promise<{id:string}>}){const {id}=await params;return <main className="page container"><div className="page-heading"><span className="eyebrow">REAL EVENT DATA</span><h1>Event analytics</h1><p>Metrics come from confirmed indexed contract events. Onchain settlement values are shown separately.</p></div><div className="dashboard-layout"><OrganizerNav/><WalletProviders><AnalyticsClient id={id}/></WalletProviders></div></main>}
