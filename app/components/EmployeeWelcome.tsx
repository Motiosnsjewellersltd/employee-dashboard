"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./EmployeeWelcome.module.css";

type WelcomeEmployee = { name: string; photoUrl?: string | null; updatedAt?: string };

export default function EmployeeWelcome({ employee, onComplete }: {
  employee: WelcomeEmployee;
  onComplete: () => void;
}) {
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const [photoFailed, setPhotoFailed] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => onCompleteRef.current(), 2500);
    return () => window.clearTimeout(timer);
  }, []);

  const photo = employee.photoUrl;
  const src = photo && !photo.startsWith("data:") && employee.updatedAt
    ? `${photo}${photo.includes("?") ? "&" : "?"}v=${encodeURIComponent(employee.updatedAt)}`
    : photo;
  const initials = employee.name.trim().split(/\s+/).slice(0, 2).map(part => part.charAt(0)).join("").toUpperCase();

  return <div className={styles.screen} role="status" aria-label={`Welcome, ${employee.name}`}>
    <svg className={styles.waves} viewBox="0 0 1440 900" preserveAspectRatio="none" aria-hidden="true">
      <path d="M-100 120 C360 90 230 640 800 420 S1320 450 1530 80 L1530 210 C1180 630 940 350 680 500 S180 190 -100 210Z" fill="white" fillOpacity=".09" />
      <path d="M-80 150 C400 120 180 570 800 420 S1310 500 1510 70" />
      <path d="M-100 225 C480 210 580 390 970 480 S1230 810 1510 830" />
      <path d="M-100 185 C380 280 430 160 780 420 S1150 520 1530 730" opacity=".35" />
    </svg>
    <div className={styles.brand}><span>MOTISONS</span><span>EMPLOYEE SYSTEM</span></div>
    <div className={styles.content}>
      <div className={styles.photo}>
        {src && !photoFailed
          ? <img src={src} alt={employee.name} onError={() => setPhotoFailed(true)} />
          : <span aria-label="Employee initials">{initials || "M"}</span>}
      </div>
      <h1>{employee.name}</h1>
      <h2>Welcome back!</h2>
      <p><span>A fresh start.</span>{" "}<span>A wonderful day ahead.</span></p>
      <div className={styles.progress} aria-hidden="true"><span /></div>
    </div>
  </div>;
}
