import { OrganizerNav } from "@/components/organizer-nav";
import { WalletProviders } from "@/components/wallet-providers";
import { EventManageClient } from "@/components/event-manage-client";
export default async function ManageEventPage({params}:{params:Promise<{id:string}>}){const {id}=await params;return <main className="page container"><div className="page-heading"><span className="eyebrow">ORGANIZER STUDIO</span><h1>Manage event</h1><p>Update event information, grant staff access, and track onchain settlement.</p></div><div className="dashboard-layout"><OrganizerNav/><WalletProviders><EventManageClient id={id}/></WalletProviders></div></main>}
