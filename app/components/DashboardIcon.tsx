import type { ReactNode } from "react";
import styles from "./DashboardIcon.module.css";
export type DashboardIconName = "calendar" | "profile" | "bell" | "leaf" | "help" | "chart" | "chat" | "gift";
export default function DashboardIcon({ name }: { name: DashboardIconName }) {
  const shapes: Record<DashboardIconName, ReactNode> = {
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18M9 15h6M12 13v5"/></>,
    profile: <><circle cx="12" cy="7" r="4" fill="currentColor" stroke="none"/><path d="M4 21v-3c0-6 16-6 16 0v3z" fill="currentColor" stroke="none"/></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4M12 1v1"/></>,
    leaf: <><path d="M20 3C9 2 3 6 4 13c1 6 11 7 15-2 1-3 1-6 1-8ZM4 21 16 8"/></>,
    help: <><circle cx="12" cy="12" r="9"/><path d="M9.5 8a2.6 2.6 0 0 1 5 1c0 2-2.5 2-2.5 4M12 17h.01"/></>,
    chart: <path d="M5 20v-6M12 20V9M19 20V4" strokeWidth="2.5"/>,
    chat: <path d="M4 3h16a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H8l-5 4V4a1 1 0 0 1 1-1z"/>,
    gift: <><path d="M3 8h18v5H3zM5 13v8h14v-8M12 8v13"/><path d="M12 8c-8 0-8-7-4-6 3 0 4 6 4 6Zm0 0c8 0 8-7 4-6-3 0-4 6-4 6Z"/></>
  };
  return <svg data-dashboard-icon={name} className={styles.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{shapes[name]}</svg>;
}
export function navigationIcon(label: string, mobile = false): DashboardIconName | undefined {
  const names: Record<string, DashboardIconName> = { Profile: "profile", "My Details": "profile", "Leave Requests": "leaf", Leave: mobile ? "calendar" : "leaf", Help: "help", "Help Tickets": "help", Reporting: "chart", "Reporting Management": "chart", Chat: "chat", Schemes: "gift", "Scheme & Incentives": "gift", "Notification Center": "bell" };
  return names[label];
}
