import { OrganizerNav } from "@/components/organizer-nav";
import { WalletProviders } from "@/components/wallet-providers";
import { EventCreateClient } from "@/components/event-create-client";
export default function CreateEventPage(){return <main className="page container"><div className="page-heading"><span className="eyebrow">ORGANIZER STUDIO</span><h1>Create an event</h1><p>Set your ticket economics and schedule carefully. These terms are immutable once published onchain.</p></div><div className="dashboard-layout"><OrganizerNav/><WalletProviders><EventCreateClient/></WalletProviders></div></main>}
