"use client";

import { useEffect, useState } from "react";

const NOTIFICATION_PERMISSION_KEY = "motisons-notification-enabled-v1";
const LOCATION_PERMISSION_KEY = "motisons-location-enabled-v1";

function rememberPermission(key: string) {
  try { localStorage.setItem(key, "1"); } catch {}
}

function forgetPermission(key: string) {
  try { localStorage.removeItem(key); } catch {}
}

function permissionRemembered(key: string) {
  try { return localStorage.getItem(key) === "1"; } catch { return false; }
}

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
      if (Notification.permission === "granted") rememberPermission(NOTIFICATION_PERMISSION_KEY);
      else if (Notification.permission === "denied") forgetPermission(NOTIFICATION_PERMISSION_KEY);

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

      const remembered = permissionRemembered(LOCATION_PERMISSION_KEY);
      let state: PermissionState | "unknown" = "unknown";

      try {
        if (navigator.permissions?.query) {
          const permission = await navigator.permissions.query({ name: "geolocation" as PermissionName });
          state = permission.state;
          if (!cancelled) {
            setLocationState(permission.state);
            permission.onchange = () => {
              setLocationState(permission.state);
              if (permission.state === "granted") rememberPermission(LOCATION_PERMISSION_KEY);
              if (permission.state === "denied") forgetPermission(LOCATION_PERMISSION_KEY);
            };
          }
        }
      } catch {
        state = "unknown";
      }

      // If this browser/device has already granted location once, do not show
      // the app permission screen again. Capture the fresh GPS location silently
      // for every successful login and attach it to that login history record.
      if (state === "granted" || remembered) {
        if (!cancelled) setLocationState("granted");
        try {
          const position = await getCurrentLocation();
          rememberPermission(LOCATION_PERMISSION_KEY);
          if (!cancelled) setLocationState("granted");
          await saveLoginLocation(position);
        } catch (error: any) {
          // A real permission denial/revocation must be enabled again. Temporary
          // GPS/network/timeout issues should not re-open the permission popup.
          if (error?.code === 1) {
            forgetPermission(LOCATION_PERMISSION_KEY);
            if (!cancelled) setLocationState("denied");
          } else if (remembered && !cancelled) {
            setLocationState("granted");
          }
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
    const notificationsDone = notificationState === "granted";
    const locationDone = locationState === "granted";
    if (notificationsDone && locationDone) setVisible(false);
  }, [notificationState, locationState, visible]);

  useEffect(() => {
    function refreshPermissions() {
      if ("Notification" in window) {
        setNotificationState(Notification.permission);
        if (Notification.permission === "granted") rememberPermission(NOTIFICATION_PERMISSION_KEY);
        if (Notification.permission === "denied") forgetPermission(NOTIFICATION_PERMISSION_KEY);
      }
      if (navigator.permissions?.query) {
        navigator.permissions.query({ name: "geolocation" as PermissionName })
          .then(permission => {
            setLocationState(permission.state);
            if (permission.state === "granted") rememberPermission(LOCATION_PERMISSION_KEY);
            if (permission.state === "denied") forgetPermission(LOCATION_PERMISSION_KEY);
          })
          .catch(() => {
            if (permissionRemembered(LOCATION_PERMISSION_KEY)) setLocationState("granted");
          });
      } else if (permissionRemembered(LOCATION_PERMISSION_KEY)) {
        setLocationState("granted");
      }
    }
    window.addEventListener("focus", refreshPermissions);
    return () => window.removeEventListener("focus", refreshPermissions);
  }, []);

  async function enableNotifications() {
    setPushBusy(true);
    setMessage("");
    try {
      if (!("Notification" in window)) throw new Error("Notifications are not supported on this browser.");
      const permission = await Notification.requestPermission();
      setNotificationState(permission);
      if (permission === "granted") rememberPermission(NOTIFICATION_PERMISSION_KEY);
      else forgetPermission(NOTIFICATION_PERMISSION_KEY);
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
      rememberPermission(LOCATION_PERMISSION_KEY);
      setLocationState("granted");
      setMessage(`Location enabled. GPS accuracy ±${Math.round(position.coords.accuracy)} m.`);
    } catch (error: any) {
      if (error?.code === 1) {
        forgetPermission(LOCATION_PERMISSION_KEY);
        setLocationState("denied");
        setMessage("Location permission was denied. Enable Location for this site from browser settings.");
      } else {
        setMessage(error?.message || "Location could not be captured. Turn on GPS and try again.");
      }
    } finally {
      setLocationBusy(false);
    }
  }

  const needsNotifications = notificationState !== "granted";
  const needsLocation = locationState !== "granted";
  if (!visible || (!needsNotifications && !needsLocation)) return null;

  return <div
    role="dialog"
    aria-modal="true"
    aria-label="Enable device permissions"
    style={{
      position: "fixed",
      inset: 0,
      zIndex: 5000,
      background: "rgba(3, 31, 51, .52)",
      backdropFilter: "blur(3px)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 16,
    }}
  >
    <div
      className="push-permission-card device-permission-card"
      style={{
        position: "relative",
        left: "auto",
        right: "auto",
        bottom: "auto",
        transform: "none",
        width: "min(680px, calc(100vw - 32px))",
        maxHeight: "calc(100dvh - 32px)",
        overflowY: "auto",
      }}
    >
      <div className="push-permission-icon">◎</div>
      <div className="push-permission-copy">
        <b>Enable device permissions</b>
        <span>Notifications and exact location are mandatory to use the Employee Dashboard on this device.</span>
        {notificationState === "unsupported" && <small style={{ color: "#c62828" }}>Notifications are not supported in this browser. Please open the dashboard in a supported browser.</small>}
        {locationState === "unsupported" && <small style={{ color: "#c62828" }}>Location is not supported on this device/browser.</small>}
        {message && <small>{message}</small>}
      </div>
      <div className="push-permission-actions device-permission-actions">
        {needsNotifications && notificationState !== "unsupported" && <button className="primary" type="button" disabled={pushBusy || locationBusy} onClick={enableNotifications}>{pushBusy ? "Enabling..." : "Enable Notifications"}</button>}
        {needsLocation && locationState !== "unsupported" && <button className="primary" type="button" disabled={pushBusy || locationBusy} onClick={enableLocation}>{locationBusy ? "Getting GPS..." : "Enable Location"}</button>}
      </div>
    </div>
  </div>;
}
