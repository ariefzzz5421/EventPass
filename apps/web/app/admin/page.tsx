import { WalletProviders } from "@/components/wallet-providers";
import { AdminClient } from "@/components/admin-client";
export default function AdminPage(){return <main className="page container"><div className="page-heading"><span className="eyebrow">PLATFORM ACCESS</span><h1>Admin overview</h1><p>Only SIWE-authenticated wallets on the platform admin allowlist can view these metrics and approve organizers.</p></div><WalletProviders><AdminClient/></WalletProviders></main>}
