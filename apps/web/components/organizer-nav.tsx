import Link from "next/link";
import { BarChart3, CalendarPlus2, LayoutDashboard, ShieldCheck } from "lucide-react";
export function OrganizerNav(){return <nav className="sidebar" aria-label="Organizer navigation"><Link href="/organizer"><LayoutDashboard size={17}/> Dashboard</Link><Link href="/organizer/events/new"><CalendarPlus2 size={17}/> Create event</Link><Link href="/organizer/analytics"><BarChart3 size={17}/> Analytics</Link><Link href="/admin"><ShieldCheck size={17}/> Platform admin</Link></nav>}
