import { WalletProviders } from "@/components/wallet-providers";
import { OrganizerClient } from "@/components/organizer-client";
import { OrganizerNav } from "@/components/organizer-nav";
export default function OrganizerPage(){return <main className="page container"><div className="page-heading"><span className="eyebrow">CREATE WITH CONFIDENCE</span><h1>Organizer studio</h1><p>Create events, manage your team, and see every sale and check-in in one place.</p></div><div className="dashboard-layout"><OrganizerNav/><WalletProviders><OrganizerClient/></WalletProviders></div></main>}
