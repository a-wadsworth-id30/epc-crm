"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

function isPlainInternalNavigation(event: MouseEvent, anchor: HTMLAnchorElement) {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey ||
    anchor.hasAttribute("download")
  ) {
    return false;
  }

  const target = anchor.getAttribute("target");
  if (target && target !== "_self") return false;

  const url = new URL(anchor.href, window.location.href);
  if (url.origin !== window.location.origin) return false;

  const sameLocation =
    url.pathname === window.location.pathname &&
    url.search === window.location.search;

  if (sameLocation) return false;

  return true;
}

export default function RouteChangeProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();
  const [pending, setPending] = useState(false);
  const showTimer = useRef<number | null>(null);
  const hideTimer = useRef<number | null>(null);
  const resetTimer = useRef<number | null>(null);

  useEffect(() => {
    if (resetTimer.current) {
      window.clearTimeout(resetTimer.current);
      resetTimer.current = null;
    }

    if (showTimer.current) {
      window.clearTimeout(showTimer.current);
      showTimer.current = null;
    }

    if (hideTimer.current) {
      window.clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }

    resetTimer.current = window.setTimeout(() => {
      setPending(false);
    }, 0);

    return () => {
      if (resetTimer.current) {
        window.clearTimeout(resetTimer.current);
        resetTimer.current = null;
      }
    };
  }, [pathname, searchKey]);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      const target = event.target;

      if (!(target instanceof Element)) return;

      const anchor = target.closest("a[href]");

      if (
        !(anchor instanceof HTMLAnchorElement) ||
        !isPlainInternalNavigation(event, anchor)
      ) {
        return;
      }

      if (showTimer.current) window.clearTimeout(showTimer.current);
      if (hideTimer.current) window.clearTimeout(hideTimer.current);

      showTimer.current = window.setTimeout(() => {
        setPending(true);
      }, 120);
      hideTimer.current = window.setTimeout(() => {
        setPending(false);
      }, 10000);
    }

    document.addEventListener("click", handleClick, true);

    return () => {
      document.removeEventListener("click", handleClick, true);
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none fixed inset-x-0 top-0 z-[99999] h-1 overflow-hidden bg-transparent transition-opacity duration-150 ${
        pending ? "opacity-100" : "opacity-0"
      }`}
    >
      <div className="h-full w-1/2 animate-pulse rounded-r-full bg-brand-500 shadow-[0_0_16px_rgba(70,95,255,0.55)]" />
    </div>
  );
}
