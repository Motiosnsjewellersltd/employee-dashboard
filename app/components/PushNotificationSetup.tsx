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

async function saveLoginLocation(position: GeolocationPosition) {
  const attemptId = typeof window !== "undefined" ? sessionStorage.getItem("motisons-login-attempt-id") : null;
  const response = await fetch("/api/login-location", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      attemptId,
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
    }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.ok) throw new Error(result?.error || "Could not save login location.");
}

function getCurrentLocation(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("Location is not supported on this device/browser."));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0,
    });
  });
}

export default function PushNotificationSetup({ employeeId }: { employeeId: string }) {
  const [publicKey, setPublicKey] = useState("");
  const [pushAvailable, setPushAvailable] = useState(false);
  const [notificationState, setNotificationState] = useState<NotificationPermission | "unsupported">("unsupported");
  const [locationState, setLocationState] = useState<PermissionState | "unsupported" | "unknown">("unknown");
  const [visible, setVisible] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [locationBusy, setLocationBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function setupPush() {
      const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
      if (!supported) {
        if (!cancelled) setNotificationState("unsupported");
        return;
      }

      setPushAvailable(true);
      setNotificationState(Notification.permission);

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
      }
    }

    async function setupLocation() {
      if (!("geolocation" in navigator)) {
        if (!cancelled) setLocationState("unsupported");
        return;
      }

      let state: PermissionState | "unknown" = "unknown";
      try {
        if (navigator.permissions?.query) {
          const permission = await navigator.permissions.query({ name: "geolocation" as PermissionName });
          state = permission.state;
          if (!cancelled) {
            setLocationState(permission.state);
            permission.onchange = () => setLocationState(permission.state);
          }
        }
      } catch {
        state = "unknown";
      }

      // Once permission has already been granted, capture the exact GPS position
      // automatically for every new successful login.
      if (state === "granted") {
        try {
          const position = await getCurrentLocation();
          await saveLoginLocation(position);
        } catch {
          // Do not block the dashboard if GPS is temporarily unavailable.
        }
      }
    }

    Promise.allSettled([setupPush(), setupLocation()]).finally(() => {
      if (!cancelled) setVisible(true);
    });

    return () => { cancelled = true; };
  }, [employeeId]);

  useEffect(() => {
    if (!visible) return;
    const notificationsDone = notificationState === "granted" || notificationState === "unsupported";
    const locationDone = locationState === "granted" || locationState === "unsupported";
    if (notificationsDone && locationDone) setVisible(false);
  }, [notificationState, locationState, visible]);

  async function enableNotifications() {
    setPushBusy(true);
    setMessage("");
    try {
      if (!("Notification" in window)) throw new Error("Notifications are not supported on this browser.");
      const permission = await Notification.requestPermission();
      setNotificationState(permission);
      if (permission !== "granted") {
        setMessage("Notification permission was not granted. Enable it from browser settings if needed.");
        return;
      }
      if (!pushAvailable || !publicKey) {
        setMessage("Notification permission enabled.");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      const subscription = existing || await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey(publicKey),
      });
      await saveSubscription(subscription);
      setMessage("Notifications enabled.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Notifications could not be enabled.");
    } finally {
      setPushBusy(false);
    }
  }

  async function enableLocation() {
    setLocationBusy(true);
    setMessage("");
    try {
      const position = await getCurrentLocation();
      await saveLoginLocation(position);
      setLocationState("granted");
      setMessage(`Location enabled. GPS accuracy ±${Math.round(position.coords.accuracy)} m.`);
    } catch (error: any) {
      if (error?.code === 1) {
        setLocationState("denied");
        setMessage("Location permission was denied. Enable Location for this site from browser settings.");
      } else {
        setMessage(error?.message || "Location could not be captured. Turn on GPS and try again.");
      }
    } finally {
      setLocationBusy(false);
    }
  }

  function dismiss() {
    // Hide for this login only. If location is still not enabled, the option
    // is shown again after the employee logs in next time.
    setVisible(false);
  }

  const needsNotifications = notificationState !== "granted" && notificationState !== "unsupported";
  const needsLocation = locationState !== "granted" && locationState !== "unsupported";
  if (!visible || (!needsNotifications && !needsLocation)) return null;

  return <div className="push-permission-card device-permission-card" role="dialog" aria-label="Enable device permissions">
    <div className="push-permission-icon">◎</div>
    <div className="push-permission-copy">
      <b>Enable device permissions</b>
      <span>Allow notifications and exact location so alerts and login location can be recorded on this device.</span>
      {message && <small>{message}</small>}
    </div>
    <div className="push-permission-actions device-permission-actions">
      {needsNotifications && <button className="primary" type="button" disabled={pushBusy || locationBusy} onClick={enableNotifications}>{pushBusy ? "Enabling..." : "Enable Notifications"}</button>}
      {needsLocation && <button className="primary" type="button" disabled={pushBusy || locationBusy} onClick={enableLocation}>{locationBusy ? "Getting GPS..." : "Enable Location"}</button>}
      <button className="light" type="button" disabled={pushBusy || locationBusy} onClick={dismiss}>Not now</button>
    </div>
  </div>;
}
