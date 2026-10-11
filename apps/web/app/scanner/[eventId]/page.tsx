import { WalletProviders } from "@/components/wallet-providers";
import { ScannerClient } from "@/components/scanner-client";
export default async function ScannerPage({params}:{params:Promise<{eventId:string}>}){const {eventId}=await params;return <main className="page container" style={{maxWidth:740}}><div className="page-heading"><span className="eyebrow">EVENT STAFF</span><h1>Ticket scanner</h1><p>Check-in requires an authorized wallet, a live ticket code, and onchain ownership verification.</p></div><WalletProviders><ScannerClient eventId={eventId}/></WalletProviders></main>}
