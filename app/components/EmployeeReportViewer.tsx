"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import styles from "./EmployeeReportViewer.module.css";

export default function EmployeeReportViewer({ report, onClose }: {
  report: { id: string; title: string }; onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const closeRef = useRef(onClose);
  const historyKey = useRef("");
  closeRef.current = onClose;

  function closeViewer() {
    if (historyKey.current && window.history.state?.motisonsReportViewer === historyKey.current) window.history.back();
    else closeRef.current();
  }

  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    const previousState = window.history.state;
    const key = `report-${Date.now()}-${Math.random()}`;
    historyKey.current = key;
    window.history.pushState({ ...previousState, motisonsReportViewer: key }, "");
    document.body.style.overflow = "hidden";
    dialogRef.current?.showModal();
    const onPop = () => { if (window.history.state?.motisonsReportViewer !== key) closeRef.current(); };
    const onMessage = (event: MessageEvent) => {
      if (event.origin === window.location.origin && event.source === frameRef.current?.contentWindow && event.data?.type === "motisons-report-close") closeViewer();
    };
    window.addEventListener("popstate", onPop);
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("message", onMessage);
      dialogRef.current?.close();
      document.body.style.overflow = previousOverflow;
      // Preserve the existing dashboard history state if the report panel unmounts.
      if (window.history.state?.motisonsReportViewer === key) window.history.replaceState(previousState, "");
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);

  return createPortal(<dialog ref={dialogRef} className={styles.viewer} aria-label={`${report.title} report viewer`}
    onCancel={event => { event.preventDefault(); closeViewer(); }}>
    <header className={styles.header}>
      <button type="button" className={styles.back} onClick={closeViewer} autoFocus>← Back to Dashboard</button>
      <strong className={styles.title}>{report.title}</strong>
      <a className={styles.download} href={`/api/employee-reports/${encodeURIComponent(report.id)}/file?download=1`}>Download</a>
    </header>
    <iframe ref={frameRef} className={styles.frame} title={`${report.title} preview`}
      src={`/report-viewer/index.html?id=${encodeURIComponent(report.id)}`} />
  </dialog>, document.body);
}
