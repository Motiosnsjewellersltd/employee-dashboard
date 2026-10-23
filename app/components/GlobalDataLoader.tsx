"use client";
import { useEffect, useState } from "react";
import { pendingDataLoads } from "@/lib/dataLoading";
import FourDotsLoader from "./FourDotsLoader";
import styles from "./GlobalDataLoader.module.css";

// Covers shared API reads (including chat) that have no local loading placeholder.
export default function GlobalDataLoader() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let live = true;
    const update = () => {
      clearTimeout(timer);
      if (!pendingDataLoads()) { if (live) setVisible(false); return; }
      timer = setTimeout(() => {
        if (!live) return;
        const localVisible = Array.from(document.querySelectorAll<HTMLElement>("[data-four-dots-loader]")).some(node => {
          if (node.closest("[data-global-loader]")) return false;
          const box = node.getBoundingClientRect();
          return box.width > 0 && box.height > 0 && box.bottom > 0 && box.top < window.innerHeight;
        });
        setVisible(pendingDataLoads() > 0 && !localVisible);
      }, 150);
    };
    window.addEventListener("motisons-data-loading", update);
    const interval = setInterval(update, 300);
    update();
    return () => { live = false; clearTimeout(timer); clearInterval(interval); window.removeEventListener("motisons-data-loading", update); };
  }, []);
  return visible ? <div data-global-loader className={styles.indicator}><FourDotsLoader /></div> : null;
}
