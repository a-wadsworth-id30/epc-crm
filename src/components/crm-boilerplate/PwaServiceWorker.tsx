"use client";

import { useEffect } from "react";

export default function PwaServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    if (!window.isSecureContext) return;

    let cancelled = false;

    const registerServiceWorker = () => {
      if (cancelled) return;

      navigator.serviceWorker
        .register("/service-worker.js", { scope: "/" })
        .catch((error) => {
          console.error("PWA service worker registration failed", error);
        });
    };

    if (document.readyState === "complete") {
      registerServiceWorker();
    } else {
      window.addEventListener("load", registerServiceWorker, { once: true });
    }

    return () => {
      cancelled = true;
      window.removeEventListener("load", registerServiceWorker);
    };
  }, []);

  return null;
}
