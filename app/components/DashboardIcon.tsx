import type { ReactNode } from "react";
import styles from "./DashboardIcon.module.css";
export type DashboardIconName = "calendar" | "profile" | "bell" | "leaf" | "help" | "chart" | "chat" | "gift" | "home" | "team" | "menu" | "duty" | "upload" | "asset" | "key" | "download" | "trash" | "lock" | "logout" | "search" | "settings";
export default function DashboardIcon({ name }: { name: DashboardIconName }) {
  const shapes: Record<DashboardIconName, ReactNode> = {
    settings: <><circle cx="12" cy="12" r="3"/><path d="m9 3-1 3-3 1-2 3 2 2-1 3 2 3 3-1 3 3 3-1 1-3 3-1 2-3-2-2 1-3-2-3-3 1-3-3z"/></>,
    home: <><path d="m3 10 9-7 9 7M5 9v12h14V9M9 21v-8h6v8"/></>,
    team: <><circle cx="9" cy="7" r="3"/><path d="M2 21v-3c0-6 14-6 14 0v3M16 4a3 3 0 0 1 0 6M19 14c2 1 3 2 3 4v3"/></>,
    menu: <path d="M4 6h16M4 12h16M4 18h16"/>,
    duty: <><rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V3h8v4M3 12c6 3 12 3 18 0M12 12v4"/></>,
    upload: <><path d="M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5"/></>,
    asset: <><path d="m3 7 9-4 9 4v13H3zM3 7h18M9 11h6M7 3v4M17 3v4"/></>,
    key: <><circle cx="8" cy="8" r="5"/><path d="m12 12 9 9m-4-4 3-3m-6 0 3-3"/></>,
    download: <path d="M12 3v13m-5-5 5 5 5-5M4 17v4h16v-4"/>,
    trash: <><path d="M3 6h18M8 6V3h8v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/></>,
    lock: <><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4M12 14v3"/></>,
    logout: <path d="M10 3H3v18h7M8 12h13m-5-5 5 5-5 5"/>,
    search: <><circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/></>,
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
export function navigationIcon(label: string, mobile = false, panel = false): DashboardIconName | undefined {
  const names: Record<string, DashboardIconName> = { Profile: "profile", "My Details": "profile", "Leave Requests": "leaf", Leave: mobile ? "calendar" : "leaf", Help: "help", "Help Tickets": "help", Reporting: "chart", "Reporting Management": "chart", Chat: "chat", Schemes: "gift", "Scheme & Incentives": "gift", "Notification Center": "bell" };
  if (panel) {
    const extra: Record<string, DashboardIconName> = { Permissions: "settings", "Incentive Reports": "chart", Dashboard: "home", Home: "home", Team: "team", "Employees Details": "team", "Add / Upload": "upload", "Official Duty": "duty", "Asset Handover": "asset", Reminder: "calendar", "Reset Password": "key", "Login / Export": "download", "Recycle Bin": "trash", "Change Password": "lock", Logout: "logout", Tools: "menu" };
    return names[label] || extra[label];
  }
  return names[label];
}
