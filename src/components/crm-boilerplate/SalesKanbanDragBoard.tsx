"use client";

import { useRouter } from "next/navigation";
import { useState, type DragEvent, type ReactNode } from "react";
import {
  moveSaleStageFromKanbanAction,
  type SalesActionState,
} from "@/lib/actions/sales";

type SalesKanbanDragBoardProps = {
  children: ReactNode;
};

const saleDragType = "application/x-id30-sale-id";
const sourceStageDragType = "application/x-id30-source-stage-id";

function closestHTMLElement(
  target: EventTarget | null,
  selector: string,
): HTMLElement | null {
  return target instanceof HTMLElement ? target.closest(selector) : null;
}

function clearDropHighlights(root: HTMLElement | null) {
  root
    ?.querySelectorAll<HTMLElement>("[data-kanban-drop-active='true']")
    .forEach((element) => {
      element.removeAttribute("data-kanban-drop-active");
    });
}

export default function SalesKanbanDragBoard({
  children,
}: SalesKanbanDragBoardProps) {
  const router = useRouter();
  const [state, setState] = useState<SalesActionState | null>(null);
  const [isMoving, setIsMoving] = useState(false);
  const [pendingSaleId, setPendingSaleId] = useState<string | null>(null);

  const messageTone =
    state?.ok && /warning|missing/i.test(state.message) ? "warning" : "normal";
  const messageClassName =
    messageTone === "warning"
      ? "border-warning-200 bg-warning-50 text-warning-800 dark:border-warning-900/40 dark:bg-warning-900/20 dark:text-warning-200"
      : state?.ok
        ? "border-success-200 bg-success-50 text-success-700 dark:border-success-800 dark:bg-success-900/20 dark:text-success-300"
        : "border-error-200 bg-error-50 text-error-700 dark:border-error-800 dark:bg-error-900/20 dark:text-error-300";

  function handleDragStart(event: DragEvent<HTMLDivElement>) {
    if (isMoving) {
      event.preventDefault();
      return;
    }

    const card = closestHTMLElement(
      event.target,
      "[data-kanban-card-id]",
    );
    const saleId = card?.dataset.kanbanCardId;

    if (!card || !saleId) return;

    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(saleDragType, saleId);
    event.dataTransfer.setData("text/plain", saleId);
    event.dataTransfer.setData(
      sourceStageDragType,
      card.dataset.kanbanCardStageId ?? "",
    );
    card.setAttribute("data-kanban-card-dragging", "true");
    setState(null);
    setPendingSaleId(saleId);
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    const column = closestHTMLElement(
      event.target,
      "[data-kanban-column-stage-id]",
    );

    if (!column || isMoving) return;

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    clearDropHighlights(event.currentTarget);
    column.setAttribute("data-kanban-drop-active", "true");
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    const column = closestHTMLElement(
      event.target,
      "[data-kanban-column-stage-id]",
    );
    const relatedTarget = event.relatedTarget;

    if (
      column &&
      relatedTarget instanceof Node &&
      !column.contains(relatedTarget)
    ) {
      column.removeAttribute("data-kanban-drop-active");
    }
  }

  function handleDragEnd(event: DragEvent<HTMLDivElement>) {
    closestHTMLElement(event.target, "[data-kanban-card-id]")?.removeAttribute(
      "data-kanban-card-dragging",
    );
    clearDropHighlights(event.currentTarget);
    setPendingSaleId(null);
  }

  async function handleDrop(event: DragEvent<HTMLDivElement>) {
    const column = closestHTMLElement(
      event.target,
      "[data-kanban-column-stage-id]",
    );
    const targetStageId = column?.dataset.kanbanColumnStageId;
    const saleId =
      event.dataTransfer.getData(saleDragType) ||
      event.dataTransfer.getData("text/plain");
    const sourceStageId = event.dataTransfer.getData(sourceStageDragType);

    if (!column || !targetStageId || !saleId) return;

    event.preventDefault();
    clearDropHighlights(event.currentTarget);

    if (sourceStageId && sourceStageId === targetStageId) {
      setState({ ok: true, message: "Stage already matched." });
      setPendingSaleId(null);
      return;
    }

    const formData = new FormData();
    formData.set("saleId", saleId);
    formData.set("salesPipelineStageId", targetStageId);
    setIsMoving(true);
    setPendingSaleId(saleId);
    setState({ ok: true, message: "Moving opportunity..." });

    try {
      const result = await moveSaleStageFromKanbanAction(formData);

      setState(result);

      if (result.ok) {
        router.refresh();
      }
    } catch {
      setState({
        ok: false,
        message: "The stage move could not be completed. Try again.",
      });
    } finally {
      setIsMoving(false);
      setPendingSaleId(null);
    }
  }

  return (
    <div
      onDragEnd={handleDragEnd}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDragStart={handleDragStart}
      onDrop={handleDrop}
    >
      {state?.message ? (
        <div className={`border-b px-4 py-2 text-xs font-medium ${messageClassName}`}>
          {state.message}
        </div>
      ) : null}
      {isMoving && pendingSaleId ? (
        <p className="sr-only" aria-live="polite">
          Moving opportunity {pendingSaleId}
        </p>
      ) : null}
      {children}
    </div>
  );
}
