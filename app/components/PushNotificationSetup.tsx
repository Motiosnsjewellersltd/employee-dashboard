"use client";

import { useEffect, useState } from "react";

function applicationServerKey(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from(Array.from(raw).map(character => character.charCodeAt(0)));
}

async function saveSubscription(subscription: PushSubscription) {
  const json = subscription.toJSON();
  const response = await fetch("/api/push-subscriptions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(json),
  });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(result.error || "Could not enable notifications.");
}

export default function PushNotificationSetup({ employeeId }: { employeeId: string }) {
  const [publicKey, setPublicKey] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function setup() {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return;
      const response = await fetch("/api/push-subscriptions", { cache: "no-store" });
      const result = await response.json().catch(() => null);
      if (cancelled || !response.ok || !result?.ok || !result.data?.enabled || !result.data.publicKey) return;
      const key = String(result.data.publicKey);
      setPublicKey(key);
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      if (Notification.permission === "granted") {
        const subscription = existing || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationServerKey(key) });
        await saveSubscription(subscription);
        return;
      }
      if (Notification.permission === "default" && localStorage.getItem(`push-prompt-dismissed:${employeeId}`) !== "1") {
        setVisible(true);
      }
    }
    setup().catch(() => null);
    return () => { cancelled = true; };
  }, [employeeId]);

  async function enable() {
    setBusy(true);
    setMessage("");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setMessage("Notification permission allow nahi hui. Browser settings se enable karein.");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      const subscription = existing || await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey(publicKey),
      });
      await saveSubscription(subscription);
      setMessage("Notifications enabled");
      window.setTimeout(() => setVisible(false), 1200);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Notifications enable nahi ho payi.");
    } finally {
      setBusy(false);
    }
  }

  function dismiss() {
    localStorage.setItem(`push-prompt-dismissed:${employeeId}`, "1");
    setVisible(false);
  }

  if (!visible) return null;
  return <div className="push-permission-card" role="dialog" aria-label="Enable notifications">
    <div className="push-permission-icon">◴</div>
    <div className="push-permission-copy"><b>Instant notifications enable karein</b><span>Chat, leave approval/rejection aur important alerts phone screen par milenge.</span>{message && <small>{message}</small>}</div>
    <div className="push-permission-actions"><button className="primary" type="button" disabled={busy} onClick={enable}>{busy ? "Enabling..." : "Enable"}</button><button className="light" type="button" disabled={busy} onClick={dismiss}>Not now</button></div>
  </div>;
}
