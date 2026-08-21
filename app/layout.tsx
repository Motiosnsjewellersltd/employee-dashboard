import type { Metadata, Viewport } from "next";
import "./globals.css";
import PwaAppSetup from "./components/PwaAppSetup";

export const metadata: Metadata = {
  title: "Motisons Employee Dashboard",
  description: "Admin, HR and Employee dashboard for Motisons",
  manifest: "/manifest.webmanifest",
  applicationName: "Motisons Employee Dashboard",
  appleWebApp: {
    capable: true,
    title: "Employee Dashboard",
    statusBarStyle: "default",
  },
  icons: {
    icon: "/icons/icon-192.png",
    shortcut: "/icons/icon-192.png",
    apple: "/icons/icon-192.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#075f9e",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <PwaAppSetup />
      </body>
    </html>
  );
}
