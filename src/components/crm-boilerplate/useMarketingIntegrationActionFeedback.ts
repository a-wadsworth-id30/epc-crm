"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useToast } from "@/components/crm-boilerplate/ToastProvider";

type MarketingIntegrationActionFeedbackState = {
  ok: boolean;
  message: string;
  savedAt: number | null;
};

export function useMarketingIntegrationActionFeedback(
  state: MarketingIntegrationActionFeedbackState,
) {
  const router = useRouter();
  const { showToast } = useToast();

  useEffect(() => {
    if (state.message) showToast(state.message, state.ok ? "success" : "error");
  }, [showToast, state.message, state.ok, state.savedAt]);

  useEffect(() => {
    if (state.ok && state.savedAt) router.refresh();
  }, [router, state.ok, state.savedAt]);
}
