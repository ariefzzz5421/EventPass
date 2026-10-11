import { OrganizerNav } from "@/components/organizer-nav";
import { WalletProviders } from "@/components/wallet-providers";
import { OrganizerAnalyticsClient } from "@/components/organizer-analytics-client";
export default function OrganizerAnalyticsPage(){return <main className="page container"><div className="page-heading"><span className="eyebrow">CONFIRMED SALES</span><h1>Organizer analytics</h1><p>Your event totals from confirmed indexed purchases and authorized check-ins.</p></div><div className="dashboard-layout"><OrganizerNav/><WalletProviders><OrganizerAnalyticsClient/></WalletProviders></div></main>}
