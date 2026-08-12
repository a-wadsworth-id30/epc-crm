"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function VisitorLogLiveRefresh({ intervalMs = 15000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    let timer: number | null = null;

    function isVisible() {
      return document.visibilityState === "visible";
    }

    function refresh() {
      if (!isVisible()) return;

      router.refresh();
    }

    function stopTimer() {
      if (timer === null) return;

      window.clearInterval(timer);
      timer = null;
    }

    function startTimer() {
      if (timer !== null || !isVisible()) return;

      timer = window.setInterval(refresh, intervalMs);
    }

    function syncVisibility({ refreshOnVisible = true } = {}) {
      if (isVisible()) {
        startTimer();
        if (refreshOnVisible) refresh();
        return;
      }

      stopTimer();
    }

    const handleVisibilityChange = () => syncVisibility();

    syncVisibility({ refreshOnVisible: false });
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      stopTimer();
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [intervalMs, router]);

  return null;
}
