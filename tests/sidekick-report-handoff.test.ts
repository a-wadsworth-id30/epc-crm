import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  readSidekickReportHandoff,
  sidekickReportHandoffEvent,
  storeSidekickReportHandoff,
} from "../src/lib/reports/sidekick-report-handoff";
import type { ReportResult } from "../src/lib/reports/types";

const globals = globalThis as Record<string, unknown>;
const originalWindow = globals.window;
const originalCustomEvent = globals.CustomEvent;

const reportResult: ReportResult = {
  plan: {
    dataset: "sales_opportunities",
    metrics: ["lead_count"],
    dimensions: ["owner"],
    filters: [],
    dateRange: { preset: "30d" },
    chartType: "bar",
    title: "Open leads by owner",
  },
  title: "Open leads by owner",
  summary: "Lead ownership ranking.",
  columns: [
    { field: "owner", label: "Owner", type: "text" },
    { field: "lead_count", label: "Leads", type: "number" },
  ],
  rows: [{ owner: "Adam", lead_count: 14 }],
  chart: {
    type: "bar",
    xField: "owner",
    yFields: ["lead_count"],
  },
  generatedAt: "2026-07-14T10:00:00.000Z",
  rowCount: 1,
};

function installBrowserHarness() {
  const storage = new Map<string, string>();
  const listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();

  function notifyListener(
    listener: EventListenerOrEventListenerObject,
    event: Event,
  ) {
    if (typeof listener === "function") {
      listener(event);
    } else {
      listener.handleEvent(event);
    }
  }

  class TestCustomEvent<T = unknown> extends Event {
    readonly detail: T;

    constructor(type: string, eventInitDict?: CustomEventInit<T>) {
      super(type);
      this.detail = eventInitDict?.detail as T;
    }
  }

  globals.window = {
    sessionStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
    },
    addEventListener: (
      type: string,
      listener: EventListenerOrEventListenerObject | null,
    ) => {
      if (!listener) return;
      const typeListeners = listeners.get(type) ?? new Set();
      typeListeners.add(listener);
      listeners.set(type, typeListeners);
    },
    removeEventListener: (
      type: string,
      listener: EventListenerOrEventListenerObject | null,
    ) => {
      if (!listener) return;
      listeners.get(type)?.delete(listener);
    },
    dispatchEvent: (event: Event) => {
      for (const listener of listeners.get(event.type) ?? []) {
        notifyListener(listener, event);
      }
      return true;
    },
  } as Window & typeof globalThis;
  globals.CustomEvent = TestCustomEvent;
}

afterEach(() => {
  if (originalWindow === undefined) {
    delete globals.window;
  } else {
    globals.window = originalWindow;
  }

  if (originalCustomEvent === undefined) {
    delete globals.CustomEvent;
  } else {
    globals.CustomEvent = originalCustomEvent;
  }
});

describe("Sidekick report handoff", () => {
  it("stores the latest report and notifies the current browser window", () => {
    installBrowserHarness();

    let eventCount = 0;
    window.addEventListener(sidekickReportHandoffEvent, () => {
      eventCount += 1;
    });

    const stored = storeSidekickReportHandoff({
      prompt: "Which lead owner has the most open leads?",
      result: reportResult,
    });

    assert.equal(stored, true);
    assert.equal(eventCount, 1);
    assert.equal(
      readSidekickReportHandoff()?.prompt,
      "Which lead owner has the most open leads?",
    );
    assert.equal(readSidekickReportHandoff()?.result.title, reportResult.title);
  });
});
