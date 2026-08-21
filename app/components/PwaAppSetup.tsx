"use client";

import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

function isStandaloneApp() {
  if (typeof window === "undefined") return false;
  const standaloneMedia = window.matchMedia("(display-mode: standalone)").matches;
  const navigatorStandalone = Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
  return standaloneMedia || navigatorStandalone;
}

export default function PwaAppSetup() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstallBar, setShowInstallBar] = useState(false);
  const [isIosInstall, setIsIosInstall] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch((error) => {
        console.error("Service worker registration failed:", error);
      });
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      if (isStandaloneApp()) return;
      setInstallPrompt(event as BeforeInstallPromptEvent);
      setShowInstallBar(true);
    };

    const handleAppInstalled = () => {
      setInstallPrompt(null);
      setShowInstallBar(false);
    };

    const isIos = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
    if (isIos && !isStandaloneApp()) {
      setIsIosInstall(true);
      setShowInstallBar(true);
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  async function handleInstall() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice.catch(() => null);
    setInstallPrompt(null);
    setShowInstallBar(false);
  }

  if (!showInstallBar || (!installPrompt && !isIosInstall)) return null;

  return (
    <div
      role="dialog"
      aria-label="Install Motisons Employee Dashboard"
      style={{
        position: "fixed",
        left: "50%",
        bottom: "18px",
        transform: "translateX(-50%)",
        zIndex: 9999,
        width: "min(520px, calc(100vw - 24px))",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "14px",
        padding: "14px 16px",
        borderRadius: "18px",
        background: "#071126",
        color: "#fff",
        boxShadow: "0 18px 50px rgba(0,0,0,.28)",
        border: "1px solid rgba(255,255,255,.12)",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 800, fontSize: "15px" }}>Install Employee Dashboard</div>
        <div style={{ marginTop: "3px", color: "#d7dfef", fontSize: "12px", lineHeight: 1.35 }}>
          {isIosInstall ? "In Safari: Share → Add to Home Screen." : "Open from your phone or PC like an installed app."}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
        {!isIosInstall && (
          <button
            type="button"
            onClick={handleInstall}
            style={{
              border: 0,
              borderRadius: "12px",
              padding: "10px 16px",
              background: "#2d67d7",
              color: "#fff",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            Install
          </button>
        )}
        <button
          type="button"
          onClick={() => setShowInstallBar(false)}
          aria-label="Close install prompt"
          title="Close"
          style={{
            width: "38px",
            height: "38px",
            border: "1px solid rgba(255,255,255,.18)",
            borderRadius: "50%",
            background: "rgba(255,255,255,.08)",
            color: "#fff",
            fontSize: "20px",
            cursor: "pointer",
          }}
        >
          ×
        </button>
      </div>
    </div>
  );
}
