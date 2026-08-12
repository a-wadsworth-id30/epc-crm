"use client";

import { useState, type ReactNode } from "react";

export default function DeferredActionLoader({
  children,
  renderTrigger,
}: {
  children: (autoOpen: boolean) => ReactNode;
  renderTrigger: (open: () => void) => ReactNode;
}) {
  const [hasLoaded, setHasLoaded] = useState(false);

  if (hasLoaded) {
    return <>{children(true)}</>;
  }

  return <>{renderTrigger(() => setHasLoaded(true))}</>;
}
