"use client";

import {
  PointerEvent as ReactPointerEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  useActionState,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ActionStateMessage from "@/components/crm-boilerplate/ActionStateMessage";
import LazyHelpTooltip from "@/components/crm-boilerplate/LazyHelpTooltip";
import { useToast } from "@/components/crm-boilerplate/ToastProvider";
import { updateRoutingFlowAction } from "@/lib/actions/phone-system";
import {
  evaluateRoutingCondition,
  routingConditionLabel,
  routingConditionOptions,
  type RoutingConditionOperator,
  type RoutingConditionType,
} from "@/lib/telephony/routing-conditions";

type ActionState = {
  ok: boolean;
  message: string;
  savedAt: number | null;
};

type Queue = {
  id: string;
  name: string;
};

type RouteUser = {
  id: string;
  name: string;
};

type RoutingRule = {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  condition: string;
  queueId: string;
  ringStrategy: string;
  timeoutSeconds: number;
  fallbackDestination: string;
  fallbackQueueId: string | null;
};

type FlowNodeType =
  | "START"
  | "RULE"
  | "QUEUE"
  | "FALLBACK"
  | "NO_MATCH"
  | "INBOUND_CALL"
  | "IF_ELSE"
  | "CONTACT_IN_OPEN_SALE"
  | "ROUTE_TO"
  | "ROUTE_TO_SALE_AGENT"
  | "RING_TEAM"
  | "WAIT"
  | "VOICEMAIL"
  | "REDIRECT"
  | "BUSINESS_HOURS"
  | "DATE_RULE"
  | "TIME_RULE"
  | "AUDIO_MESSAGE"
  | "IVR_MENU"
  | "END_CALL";

type FlowNode = {
  id: string;
  type: FlowNodeType;
  x: number;
  y: number;
  data?: Record<string, unknown>;
};

type FlowEdge = {
  id: string;
  from: string;
  to: string;
  fromHandle: string;
  label: string;
};

type IvrMenuOption = {
  key: string;
  label: string;
  message: string;
  destination: string;
};

type RoutingFlow = {
  version?: number;
  nodes: FlowNode[];
  edges?: FlowEdge[];
};

type CanvasPosition = {
  x: number;
  y: number;
};

type DragState = {
  id: string;
  startX: number;
  startY: number;
  origin: CanvasPosition;
  dimensions: { width: number; height: number };
  historySnapshot: GraphState;
  moved: boolean;
};

type GraphState = {
  nodes: FlowNode[];
  edges: FlowEdge[];
};

type PanState = {
  startX: number;
  startY: number;
  originX: number;
  originY: number;
};

type UtilityDragState = {
  startX: number;
  startY: number;
  originX: number;
  originY: number;
};

type PaletteItem = {
  type: FlowNodeType;
  label: string;
  description: string;
  handle?: string;
};

type InsertMenuState = {
  x: number;
  y: number;
  fromNodeId: string | null;
  fromHandle: string;
  label: string;
};

type SimulatorContext = {
  attribution: boolean;
  businessOpen: boolean;
  contact: boolean;
  inboundNumber: string;
  ivrKey: string;
  openSale: boolean;
  source: string;
  trackingNumber: boolean;
};

const initialState: ActionState = {
  ok: false,
  message: "",
  savedAt: null,
};

const inboundNodeId = "inbound-call";
const openSaleNodeId = "condition:open-sale";
const saleAgentNodeId = "action:sale-agent";
const ownerWaitNodeId = "wait:owner";
const salesTeamNodeId = "queue:sales-team";
const voicemailNodeId = "voicemail:default";
const endNodeId = "end-call";

const legacyDirectTeamNodeId = "queue:sales-team";
const legacyOwnerTeamNodeId = "queue:sales-team-after-owner";
const legacyStartNodeId = "start";
const legacyOpenSaleNodeId = "rule:open-sale";
const legacySaleAgentNodeId = "queue:sale-agent";
const legacyOwnerWaitNodeId = "fallback:owner-wait";
const legacyVoicemailNodeId = "fallback:voicemail";
const legacyEndNodeId = "no-match";

const nodeWidth = 320;
const nodeHeight = 124;
const endNodeWidth = 104;
const endNodeHeight = 64;
const canvasWidth = 2600;
const canvasHeight = 1900;
const sidebarWidth = 452;
const ivrOptionLimit = 8;
const ivrKeyPattern = /^[0-9*#]$/;
const phoneKeypadKeys = [
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "*",
  "0",
  "#",
];
const minZoom = 0.55;
const maxZoom = 1.35;
const dragSelectThreshold = 5;
const normalHandleOffsetY = 14;
const branchHandleOffsetY = 42;
const targetHandleOffsetY = -8;

const paletteItems: PaletteItem[] = [
  {
    type: "IF_ELSE",
    label: "If / else",
    description: "Branch the call based on a rule.",
  },
  {
    type: "ROUTE_TO",
    label: "Route to",
    description: "Send the call to a sale agent, person or team.",
  },
  {
    type: "WAIT",
    label: "Wait",
    description: "Pause before moving to the next step.",
  },
  {
    type: "VOICEMAIL",
    label: "Voicemail",
    description: "Record a message when nobody answers.",
  },
  {
    type: "BUSINESS_HOURS",
    label: "Business hours",
    description: "Branch based on whether the team is open.",
  },
  {
    type: "TIME_RULE",
    label: "Time rule",
    description: "Branch based on time of day.",
  },
  {
    type: "DATE_RULE",
    label: "Date rule",
    description: "Branch based on a date or holiday.",
  },
  {
    type: "AUDIO_MESSAGE",
    label: "Audio message",
    description: "Play a message before continuing.",
  },
  {
    type: "IVR_MENU",
    label: "IVR menu",
    description: "Let callers press a key to choose a path.",
  },
  {
    type: "REDIRECT",
    label: "Redirect",
    description: "Forward the caller to another destination.",
  },
  {
    type: "END_CALL",
    label: "End call",
    description: "Finish the caller journey.",
  },
];

const canonicalNodeIds = new Set([
  inboundNodeId,
  openSaleNodeId,
  saleAgentNodeId,
  ownerWaitNodeId,
  salesTeamNodeId,
  voicemailNodeId,
  endNodeId,
]);

const cleanDefaultNodePositions: Record<string, CanvasPosition> = {
  [inboundNodeId]: { x: 520, y: 80 },
  [openSaleNodeId]: { x: 520, y: 300 },
  [saleAgentNodeId]: { x: 140, y: 560 },
  [ownerWaitNodeId]: { x: 140, y: 760 },
  [salesTeamNodeId]: { x: 520, y: 950 },
  [voicemailNodeId]: { x: 520, y: 1150 },
  [endNodeId]: { x: 628, y: 1360 },
};

export default function CallRoutingFlowBuilder({
  queues,
  routingFlow,
  rules,
  users,
}: {
  queues: Queue[];
  routingFlow?: RoutingFlow | null;
  rules: RoutingRule[];
  users: RouteUser[];
}) {
  const { showToast } = useToast();
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const zoomRef = useRef(0.82);
  const nodeDragRef = useRef<DragState | null>(null);
  const utilityDragRef = useRef<UtilityDragState | null>(null);
  const suppressNextSelectRef = useRef(false);
  const [state, formAction, isPending] = useActionState(
    updateRoutingFlowAction,
    initialState,
  );
  const [editorOpen, setEditorOpen] = useState(false);
  const [localRules, setLocalRules] = useState(() =>
    rules.slice().sort((a, b) => a.priority - b.priority),
  );
  const [nodes, setNodes] = useState(() =>
    buildInitialNodes(routingFlow?.nodes ?? []),
  );
  const [edges, setEdges] = useState(() =>
    buildInitialEdges(routingFlow?.edges ?? [], routingFlow?.nodes ?? []),
  );
  const [selectedNodeId, setSelectedNodeId] = useState(openSaleNodeId);
  const [dirty, setDirty] = useState(false);
  const [history, setHistory] = useState<GraphState[]>([]);
  const [future, setFuture] = useState<GraphState[]>([]);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [panDrag, setPanDrag] = useState<PanState | null>(null);
  const [zoom, setZoom] = useState(0.82);
  const [utilityPosition, setUtilityPosition] = useState({ x: 20, y: 86 });
  const [insertMenu, setInsertMenu] = useState<InsertMenuState | null>(null);
  const [simulatorContext, setSimulatorContext] = useState<SimulatorContext>({
    attribution: false,
    businessOpen: true,
    contact: false,
    inboundNumber: "",
    ivrKey: "1",
    openSale: false,
    source: "",
    trackingNumber: false,
  });

  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? null;
  const selectedRule = selectedNode
    ? ruleForNode(localRules, selectedNode)
    : null;
  const issues = useMemo(() => getFlowIssues(nodes, edges), [nodes, edges]);
  const simulatorPath = useMemo(
    () => simulateRoutingPath(nodes, edges, simulatorContext),
    [edges, nodes, simulatorContext],
  );
  const payload = useMemo(
    () =>
      JSON.stringify({
        rules: localRules.map((rule, index) => ({
          ...rule,
          priority: index + 1,
        })),
        nodes,
        edges,
      }),
    [edges, localRules, nodes],
  );

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    if (!state.message || state.savedAt === null) return;
    showToast(state.message, state.ok ? "success" : "error");
    if (state.ok) {
      queueMicrotask(() => setDirty(false));
    }
  }, [showToast, state]);

  useEffect(() => {
    if (!editorOpen) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (insertMenu) {
          setInsertMenu(null);
          return;
        }
        setEditorOpen(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editorOpen, insertMenu]);

  function currentGraph(): GraphState {
    return {
      nodes,
      edges,
    };
  }

  function commitGraph(nextNodes: FlowNode[], nextEdges: FlowEdge[] = edges) {
    setHistory((current) => [...current.slice(-19), currentGraph()]);
    setFuture([]);
    setNodes(nextNodes);
    setEdges(nextEdges);
    setDirty(true);
  }

  function updateRule(ruleId: string, patch: Partial<RoutingRule>) {
    setLocalRules((current) =>
      current.map((rule) =>
        rule.id === ruleId ? { ...rule, ...patch } : rule,
      ),
    );
    setDirty(true);
  }

  function updateNode(nodeId: string, patch: Partial<FlowNode>) {
    commitGraph(
      nodes.map((node) =>
        node.id === nodeId
          ? {
              ...node,
              ...patch,
              data: {
                ...node.data,
                ...patch.data,
              },
            }
          : node,
      ),
    );
  }

  function updateIvrMenuOptions(nodeId: string, options: IvrMenuOption[]) {
    const normalizedOptions = normalizeIvrMenuOptions(options);
    const nextNodes = nodes.map((node) =>
      node.id === nodeId
        ? {
            ...node,
            data: {
              ...node.data,
              ivrOptions: normalizedOptions,
              ivrKeys: normalizedOptions.map((option) => option.key),
            },
          }
        : node,
    );
    const nonDigitEdges = edges.filter(
      (edge) => !(edge.from === nodeId && edge.fromHandle.startsWith("digit:")),
    );
    const digitEdges = normalizedOptions
      .filter((option) => option.destination)
      .map((option) => {
        const handle = `digit:${option.key}`;
        const existing = edges.find(
          (edge) => edge.from === nodeId && edge.fromHandle === handle,
        );

        return {
          id: existing?.id ?? edgeId(nodeId, option.destination, handle),
          from: nodeId,
          to: option.destination,
          fromHandle: handle,
          label: option.label
            ? `key ${option.key}: ${option.label}`
            : `key ${option.key}`,
        };
      });

    commitGraph(nextNodes, [...nonDigitEdges, ...digitEdges]);
  }

  function addPaletteNode(
    item: PaletteItem,
    menu: InsertMenuState | null = insertMenu,
  ) {
    const ruleId =
      item.type === "IF_ELSE" ||
      item.type === "RING_TEAM" ||
      item.type === "ROUTE_TO"
        ? uniqueRuleId(
            slugify(item.label),
            localRules.map((rule) => rule.id),
          )
        : null;
    const nextRule = ruleId
      ? createRoutingRule(ruleId, item, queues, localRules.length)
      : null;
    const fromNode = menu?.fromNodeId
      ? nodes.find((node) => node.id === menu.fromNodeId)
      : selectedNode;
    const position = getNewNodePosition(nodes, fromNode);
    const node = createFlowNode(item, position, ruleId);
    const nextNodes = [...nodes, node];
    const nextEdges = menu?.fromNodeId
      ? insertNodeIntoEdge(
          edges,
          menu.fromNodeId,
          node,
          menu.fromHandle,
          menu.label,
        )
      : edges;

    if (nextRule) {
      setLocalRules((current) => [...current, nextRule]);
    }
    commitGraph(nextNodes, nextEdges);
    setSelectedNodeId(node.id);
    setInsertMenu(null);
  }

  function deleteSelectedNode() {
    if (!selectedNode || canonicalNodeIds.has(selectedNode.id)) return;
    const linkedRule = ruleForNode(localRules, selectedNode);
    commitGraph(
      nodes.filter((node) => node.id !== selectedNode.id),
      edges.filter(
        (edge) => edge.from !== selectedNode.id && edge.to !== selectedNode.id,
      ),
    );
    if (linkedRule) {
      setLocalRules((current) =>
        current.filter((rule) => rule.id !== linkedRule.id),
      );
    }
    setSelectedNodeId(openSaleNodeId);
  }

  function setEdgeDestination(
    from: string,
    fromHandle: string,
    to: string,
    label: string,
  ) {
    const existing = edges.find(
      (edge) => edge.from === from && edge.fromHandle === fromHandle,
    );
    const nextEdges = to
      ? [
          ...edges.filter(
            (edge) => !(edge.from === from && edge.fromHandle === fromHandle),
          ),
          {
            id: existing?.id ?? edgeId(from, to, fromHandle),
            from,
            to,
            fromHandle,
            label,
          },
        ]
      : edges.filter(
          (edge) => !(edge.from === from && edge.fromHandle === fromHandle),
        );
    commitGraph(nodes, nextEdges);
  }

  function updateRouteTarget(nodeId: string, target: string) {
    const node = nodes.find((candidate) => candidate.id === nodeId);
    if (!node) return;

    updateNode(nodeId, {
      data: {
        routeTarget: target,
        label: String(node.data?.label ?? "").startsWith("Route to")
          ? "Route to"
          : node.data?.label,
      },
    });
  }

  function openInsertMenu(
    event: ReactMouseEvent<HTMLElement>,
    fromNodeId: string | null,
    fromHandle = "next",
    label = "next",
  ) {
    event.preventDefault();
    event.stopPropagation();
    const rect = canvasRef.current?.getBoundingClientRect();
    const x = rect ? event.clientX - rect.left : utilityPosition.x + 48;
    const y = rect ? event.clientY - rect.top : utilityPosition.y;
    setInsertMenu({
      x: clamp(x, 16, 900),
      y: clamp(y, 16, 560),
      fromNodeId,
      fromHandle,
      label,
    });
  }

  function startNodeDrag(
    node: FlowNode,
    event: ReactPointerEvent<HTMLElement>,
  ) {
    if (event.button !== 0 || isEditorControl(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    nodeDragRef.current = {
      id: node.id,
      startX: event.clientX,
      startY: event.clientY,
      origin: { x: node.x, y: node.y },
      dimensions: nodeDimensions(node),
      historySnapshot: currentGraph(),
      moved: false,
    };
    setSelectedNodeId(node.id);
  }

  function moveNodeDrag(clientX: number, clientY: number) {
    const drag = nodeDragRef.current;
    if (!drag) return;

    const x = clamp(
      drag.origin.x + (clientX - drag.startX) / zoomRef.current,
      40,
      canvasWidth - drag.dimensions.width - sidebarWidth,
    );
    const y = clamp(
      drag.origin.y + (clientY - drag.startY) / zoomRef.current,
      40,
      canvasHeight - drag.dimensions.height - 40,
    );

    if (
      Math.hypot(clientX - drag.startX, clientY - drag.startY) >
      dragSelectThreshold
    ) {
      drag.moved = true;
    }

    setNodes((current) =>
      current.map((node) => (node.id === drag.id ? { ...node, x, y } : node)),
    );
    setDirty(true);
  }

  function canvasPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (nodeDragRef.current) {
      return;
    }

    if (panDrag) {
      setPan({
        x: panDrag.originX + event.clientX - panDrag.startX,
        y: panDrag.originY + event.clientY - panDrag.startY,
      });
    }
  }

  function stopNodeDrag() {
    const drag = nodeDragRef.current;
    if (!drag) return;

    nodeDragRef.current = null;
    if (drag.moved) {
      suppressNextSelectRef.current = true;
      setHistory((current) => [...current.slice(-19), drag.historySnapshot]);
      setFuture([]);
      window.setTimeout(() => {
        suppressNextSelectRef.current = false;
      }, 0);
    }
  }

  useEffect(() => {
    if (!editorOpen) return;

    function onPointerMove(event: PointerEvent) {
      if (!nodeDragRef.current) return;
      event.preventDefault();
      moveNodeDrag(event.clientX, event.clientY);
    }

    function onPointerUp() {
      stopNodeDrag();
    }

    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [editorOpen]);

  function undo() {
    const previous = history.at(-1);
    if (!previous) return;
    setFuture((current) => [currentGraph(), ...current]);
    setHistory((current) => current.slice(0, -1));
    setNodes(previous.nodes);
    setEdges(previous.edges);
    setDirty(true);
  }

  function redo() {
    const next = future[0];
    if (!next) return;
    setHistory((current) => [...current, currentGraph()]);
    setFuture((current) => current.slice(1));
    setNodes(next.nodes);
    setEdges(next.edges);
    setDirty(true);
  }

  function setZoomSafe(value: number) {
    setZoom(Math.min(maxZoom, Math.max(minZoom, Number(value.toFixed(2)))));
  }

  function fitFlow() {
    setZoomSafe(0.82);
    setPan({ x: 0, y: 0 });
  }

  function tidyFlow() {
    const customNodes = nodes.filter((node) => !canonicalNodeIds.has(node.id));
    const customStartY = 140;
    const customPositions = customNodes.reduce<Record<string, CanvasPosition>>(
      (positions, node, index) => {
        positions[node.id] = {
          x: 940 + (index % 2) * 360,
          y: customStartY + Math.floor(index / 2) * 190,
        };
        return positions;
      },
      {},
    );

    commitGraph(
      nodes.map((node) => ({
        ...node,
        ...(cleanDefaultNodePositions[node.id] ??
          customPositions[node.id] ??
          {}),
      })),
      edges,
    );
    fitFlow();
  }

  function startUtilityDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    utilityDragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: utilityPosition.x,
      originY: utilityPosition.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function dragUtilityBar(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = utilityDragRef.current;
    if (!drag) return;
    event.preventDefault();
    event.stopPropagation();
    setUtilityPosition({
      x: clamp(drag.originX + event.clientX - drag.startX, 12, 520),
      y: clamp(drag.originY + event.clientY - drag.startY, 72, 520),
    });
  }

  function stopUtilityDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    utilityDragRef.current = null;
  }

  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-gray-900">
        <div className="flex flex-col gap-4 border-b border-gray-200 px-5 py-4 xl:flex-row xl:items-center xl:justify-between dark:border-gray-800">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gray-900 text-sm font-semibold text-white dark:bg-white dark:text-gray-900">
              IVR
            </span>
            <div className="min-w-0">
              <div className="text-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400">
                Routing SmartFlow
              </div>
              <div className="mt-1 flex min-w-0 items-center gap-2">
                <h3 className="truncate text-base font-semibold text-gray-900 dark:text-white/90">
                  Main line call journey
                </h3>
                <LazyHelpTooltip content="Shows the visual call-routing flow for the main line so users can inspect and edit how callers move through IVR, teams and fallbacks." />
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex flex-wrap gap-2">
              <PreviewStat label="Nodes" value={nodes.length} />
              <PreviewStat label="Connections" value={edges.length} />
              <PreviewStat label="Teams" value={queues.length} />
            </div>
            <button
              type="button"
              onClick={() => setEditorOpen(true)}
              className="inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white shadow-theme-xs transition hover:bg-brand-600"
            >
              Edit flow
            </button>
          </div>
        </div>
        <div
          role="button"
          tabIndex={0}
          onClick={() => setEditorOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              setEditorOpen(true);
            }
          }}
          className="group relative block h-[520px] w-full cursor-pointer overflow-hidden bg-[#f6f8fb] bg-[radial-gradient(circle_at_1px_1px,#d8e0ec_1px,transparent_0)] bg-[length:24px_24px] text-left transition outline-none hover:bg-[#f2f6fb] focus-visible:ring-2 focus-visible:ring-brand-500 dark:bg-gray-950 dark:hover:bg-gray-950"
        >
          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-4 p-4">
            <div className="rounded-xl border border-gray-200 bg-white/95 px-3 py-2 shadow-theme-xs backdrop-blur dark:border-gray-800 dark:bg-gray-900/95">
              <p className="text-[11px] font-semibold tracking-wide text-gray-400 uppercase dark:text-gray-500">
                Preview
              </p>
              <p className="mt-0.5 text-sm font-semibold text-gray-800 dark:text-white/90">
                Published caller route
              </p>
            </div>
            <span className="inline-flex h-9 items-center justify-center rounded-lg border border-gray-200 bg-white/95 px-3 text-sm font-semibold text-gray-700 shadow-theme-xs transition group-hover:border-brand-500 group-hover:bg-brand-500 group-hover:text-white dark:border-gray-800 dark:bg-gray-900/95 dark:text-gray-200">
              Edit flow
            </span>
          </div>
          <div className="relative h-full w-full">
            <div
              className="absolute top-3 left-1/2 origin-top-left"
              style={{ transform: "translateX(-425px) scale(0.38)" }}
            >
              <FlowCanvas
                edges={edges}
                markerId="routing-preview-arrow"
                nodes={nodes}
                queues={queues}
                rules={localRules}
                selectedNodeId={selectedNodeId}
                staticOnly
              />
            </div>
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-white via-white/90 to-transparent px-5 pt-14 pb-4 dark:from-gray-900 dark:via-gray-900/90">
            <div className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-white/95 px-4 py-3 shadow-theme-xs backdrop-blur sm:flex-row sm:items-center sm:justify-between dark:border-gray-800 dark:bg-gray-900/95">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Click the canvas to edit nodes, routes and IVR branches.
              </p>
              <span className="text-xs font-semibold tracking-wide text-brand-500 uppercase">
                Open editor
              </span>
            </div>
          </div>
        </div>
      </div>

      {editorOpen ? (
        <div className="fixed inset-0 z-[999999] bg-white dark:bg-gray-950">
          <form
            action={formAction}
            className="relative h-screen min-h-0 overflow-hidden"
          >
            <input type="hidden" name="routingFlowPayload" value={payload} />

            <div className="pointer-events-none absolute inset-x-0 top-0 z-[80] flex h-[62px] items-center justify-between border-b border-gray-200 bg-white/96 px-4 shadow-sm backdrop-blur dark:border-gray-800 dark:bg-gray-950/95">
              <div className="pointer-events-auto flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setEditorOpen(false)}
                  className="grid h-10 w-10 place-items-center rounded-lg border border-gray-200 bg-white text-xl leading-none text-gray-700 shadow-sm hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200"
                  aria-label="Exit routing editor"
                  title="Exit routing editor"
                >
                  ×
                </button>
                <button
                  type="button"
                  disabled={!history.length}
                  onClick={undo}
                  className="grid h-10 w-10 place-items-center rounded-lg text-xl text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:text-gray-300"
                  aria-label="Undo"
                  title="Undo"
                >
                  ↶
                </button>
                <button
                  type="button"
                  disabled={!future.length}
                  onClick={redo}
                  className="grid h-10 w-10 place-items-center rounded-lg text-xl text-gray-400 hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-300"
                  aria-label="Redo"
                  title="Redo"
                >
                  ↷
                </button>
              </div>

              <div className="pointer-events-none absolute inset-x-0 flex justify-center">
                <div className="pointer-events-auto flex items-center gap-2">
                  <h2 className="text-base font-semibold text-gray-950 dark:text-white">
                    Call Routing Smartflow
                  </h2>
                  <LazyHelpTooltip content="Use this editor to build, connect and publish the call-routing nodes that control the main line journey." />
                </div>
              </div>

              <div className="pointer-events-auto flex items-center gap-3">
                {issues.length ? (
                  <span className="max-w-[320px] truncate rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                    Fix before publish: {issues[0]}
                  </span>
                ) : null}
                <ActionStateMessage state={state.savedAt ? state : undefined} />
                <button
                  type="submit"
                  disabled={isPending || !dirty || issues.length > 0}
                  title={issues.length ? issues[0] : "Publish routing flow"}
                  className={`inline-flex h-10 items-center rounded-lg px-5 text-sm font-semibold shadow-sm transition disabled:cursor-not-allowed ${
                    dirty && !issues.length
                      ? "bg-brand-500 text-white hover:bg-brand-600"
                      : "border border-gray-200 bg-gray-100 text-gray-400 dark:border-gray-800 dark:bg-gray-900"
                  }`}
                >
                  {isPending ? "Publishing..." : "Publish"}
                </button>
              </div>
            </div>

            <div
              data-routing-editor-canvas
              ref={canvasRef}
              className={`relative h-full touch-none overflow-hidden bg-[#f5f7fb] bg-[radial-gradient(circle_at_1px_1px,#d9e0ec_1px,transparent_0)] bg-[length:22px_22px] pt-[62px] dark:bg-gray-950 ${
                panDrag ? "cursor-grabbing" : "cursor-grab"
              }`}
              onPointerDown={(event) => {
                if (event.button !== 0 || isEditorControl(event.target)) return;
                setInsertMenu(null);
                setPanDrag({
                  startX: event.clientX,
                  startY: event.clientY,
                  originX: pan.x,
                  originY: pan.y,
                });
              }}
              onPointerMove={canvasPointerMove}
              onPointerUp={() => {
                stopNodeDrag();
                setPanDrag(null);
              }}
              onPointerCancel={() => {
                stopNodeDrag();
                setPanDrag(null);
              }}
            >
              <div
                className="absolute z-30 grid divide-y divide-gray-200 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:divide-gray-800 dark:border-gray-800 dark:bg-gray-900"
                style={{ left: utilityPosition.x, top: utilityPosition.y }}
                onPointerMove={dragUtilityBar}
                onPointerUp={stopUtilityDrag}
                onPointerCancel={stopUtilityDrag}
              >
                <ToolbarButton
                  label="Move utility bar"
                  onPointerDown={startUtilityDrag}
                  title="Move utility bar"
                >
                  ≡
                </ToolbarButton>
                <ToolbarButton
                  label="Add node"
                  onClick={(event) => {
                    const selected = nodes.find(
                      (node) => node.id === selectedNodeId,
                    );
                    const nextHandle = selected
                      ? defaultOutgoingHandle(selected)
                      : { handle: "next", label: "next" };
                    openInsertMenu(
                      event,
                      selectedNodeId,
                      nextHandle.handle,
                      nextHandle.label,
                    );
                  }}
                >
                  +
                </ToolbarButton>
                <ToolbarButton
                  label="Zoom in"
                  onClick={() => setZoomSafe(zoom + 0.1)}
                >
                  +
                </ToolbarButton>
                <div className="grid h-9 w-9 place-items-center text-center text-[10px] font-semibold text-gray-600 dark:text-gray-300">
                  {Math.round(zoom * 100)}%
                </div>
                <ToolbarButton
                  label="Zoom out"
                  onClick={() => setZoomSafe(zoom - 0.1)}
                >
                  -
                </ToolbarButton>
                <ToolbarButton label="Fit flow" onClick={fitFlow}>
                  ⤢
                </ToolbarButton>
                <ToolbarButton label="Tidy flow" onClick={tidyFlow}>
                  ⤡
                </ToolbarButton>
              </div>

              {insertMenu ? (
                <>
                  <button
                    aria-label="Close node menu"
                    className="absolute inset-0 z-20 cursor-default"
                    type="button"
                    onClick={() => setInsertMenu(null)}
                  />
                  <div
                    className="absolute z-40"
                    style={{ left: insertMenu.x + 10, top: insertMenu.y }}
                  >
                    <StepPalette
                      onAdd={(item) => addPaletteNode(item, insertMenu)}
                      onClose={() => setInsertMenu(null)}
                    />
                  </div>
                </>
              ) : null}

              <div
                className="absolute top-[62px] left-0 origin-top-left transition-transform"
                style={{
                  width: canvasWidth,
                  height: canvasHeight,
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                }}
              >
                <FlowCanvas
                  edges={edges}
                  issues={issues}
                  markerId="routing-editor-arrow"
                  nodes={nodes}
                  onAddAfter={openInsertMenu}
                  onNodePointerDown={startNodeDrag}
                  onSelectNode={(nodeId) => {
                    if (suppressNextSelectRef.current) return;
                    setSelectedNodeId(nodeId);
                    setInsertMenu(null);
                  }}
                  queues={queues}
                  rules={localRules}
                  selectedNodeId={selectedNodeId}
                />
              </div>
              <FlowSimulatorPanel
                context={simulatorContext}
                nodes={nodes}
                onChange={setSimulatorContext}
                path={simulatorPath}
              />
            </div>

            <aside className="absolute top-[78px] right-4 bottom-4 z-40 w-[420px] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-800 dark:bg-gray-900">
              {selectedNode ? (
                <NodeInspector
                  edges={edges}
                  issues={issues}
                  node={selectedNode}
                  nodes={nodes}
                  onDelete={deleteSelectedNode}
                  onSetDestination={setEdgeDestination}
                  onUpdateIvrOptions={updateIvrMenuOptions}
                  onSetRouteTarget={updateRouteTarget}
                  onUpdateNode={updateNode}
                  onUpdateRule={updateRule}
                  queues={queues}
                  rule={selectedRule}
                  users={users}
                />
              ) : (
                <div className="p-5 text-sm text-gray-500 dark:text-gray-400">
                  Select a node to edit routing settings.
                </div>
              )}
            </aside>
          </form>
        </div>
      ) : null}
    </>
  );
}

function FlowCanvas({
  edges,
  issues = [],
  markerId,
  nodes,
  onAddAfter,
  onNodePointerDown,
  onSelectNode,
  queues,
  rules,
  selectedNodeId,
  staticOnly = false,
}: {
  edges: FlowEdge[];
  issues?: string[];
  markerId: string;
  nodes: FlowNode[];
  onAddAfter?: (
    event: ReactMouseEvent<HTMLElement>,
    fromNodeId: string | null,
    fromHandle?: string,
    label?: string,
  ) => void;
  onNodePointerDown?: (
    node: FlowNode,
    event: ReactPointerEvent<HTMLElement>,
  ) => void;
  onSelectNode?: (nodeId: string) => void;
  queues: Queue[];
  rules: RoutingRule[];
  selectedNodeId: string;
  staticOnly?: boolean;
}) {
  return (
    <div
      className="relative"
      style={{ width: canvasWidth, height: canvasHeight }}
    >
      <CanvasConnectors edges={edges} markerId={markerId} nodes={nodes} />
      {nodes.map((node) => (
        <FlowNodeCard
          key={node.id}
          issues={issues}
          node={node}
          onAddAfter={onAddAfter}
          onPointerDown={onNodePointerDown}
          onSelect={onSelectNode}
          queues={queues}
          rule={ruleForNode(rules, node)}
          selected={node.id === selectedNodeId}
          staticOnly={staticOnly}
        />
      ))}
    </div>
  );
}

function CanvasConnectors({
  edges,
  markerId,
  nodes,
}: {
  edges: FlowEdge[];
  markerId: string;
  nodes: FlowNode[];
}) {
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0 overflow-visible text-[#8bb8c3]"
      height={canvasHeight}
      width={canvasWidth}
    >
      <defs>
        <marker
          id={markerId}
          markerHeight="12"
          markerUnits="userSpaceOnUse"
          markerWidth="12"
          orient="auto-start-reverse"
          refX="10"
          refY="6"
        >
          <path
            d="M2 2 L10 6 L2 10"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
          />
        </marker>
      </defs>
      {edges.map((edge) => {
        const from = nodes.find((node) => node.id === edge.from);
        const to = nodes.find((node) => node.id === edge.to);
        if (!from || !to) return null;
        const source = getEdgeSourcePoint(from, edge.fromHandle);
        return (
          <CanvasPath
            edge={edge}
            from={source}
            key={edge.id}
            markerId={markerId}
            to={getEdgeTargetPoint(to, source)}
          />
        );
      })}
    </svg>
  );
}

function CanvasPath({
  edge,
  from,
  markerId,
  to,
}: {
  edge: FlowEdge;
  from: CanvasPosition;
  markerId: string;
  to: CanvasPosition;
}) {
  const path = buildConnectorPath(from, to);
  const color =
    edge.fromHandle === "yes"
      ? "#059669"
      : edge.fromHandle === "no"
        ? "#dc2626"
        : "#8bb8c3";
  const labelPoint = connectorLabelPoint(edge, from, to);

  return (
    <g>
      <path
        d={path}
        fill="none"
        markerEnd={`url(#${markerId})`}
        stroke={color}
        strokeDasharray={edge.fromHandle === "next" ? undefined : "3 8"}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
      {edge.label ? (
        <g transform={`translate(${labelPoint.x} ${labelPoint.y})`}>
          <rect
            x="-8"
            y="-16"
            width={Math.max(46, edge.label.length * 7 + 16)}
            height="22"
            rx="7"
            fill="#f5f7fb"
            stroke="#d9e0ec"
            strokeWidth="1"
          />
          <text fill={color} fontSize="12" fontWeight="700">
            {edge.label}
          </text>
        </g>
      ) : null}
    </g>
  );
}

function buildConnectorPath(from: CanvasPosition, to: CanvasPosition) {
  const arrowStemLength = 14;
  const stemStart = { x: to.x, y: to.y - arrowStemLength };
  const horizontalGap = stemStart.x - from.x;
  const verticalGap = stemStart.y - from.y;
  const sameColumn = Math.abs(horizontalGap) < 28;

  if (sameColumn) {
    const controlOffset =
      verticalGap > 0
        ? Math.max(12, Math.min(118, Math.abs(verticalGap) * 0.45))
        : Math.max(42, Math.min(118, Math.abs(verticalGap) * 0.45));
    return [
      `M ${from.x} ${from.y}`,
      `C ${from.x} ${from.y + controlOffset}, ${stemStart.x} ${stemStart.y - controlOffset}, ${stemStart.x} ${stemStart.y}`,
      `L ${to.x} ${to.y}`,
    ].join(" ");
  }

  const direction = horizontalGap > 0 ? 1 : -1;
  const exitY =
    verticalGap > 80
      ? from.y + Math.max(46, Math.min(112, verticalGap * 0.3))
      : Math.min(from.y, stemStart.y) - 76;
  const entryY =
    verticalGap > 80
      ? stemStart.y - Math.max(46, Math.min(112, verticalGap * 0.3))
      : exitY;
  const midX = from.x + horizontalGap * 0.5;

  return [
    `M ${from.x} ${from.y}`,
    `C ${from.x} ${exitY}, ${midX - direction * 48} ${exitY}, ${midX} ${exitY}`,
    `C ${midX + direction * 48} ${exitY}, ${stemStart.x} ${entryY}, ${stemStart.x} ${stemStart.y}`,
    `L ${to.x} ${to.y}`,
  ].join(" ");
}

function connectorLabelPoint(
  edge: FlowEdge,
  from: CanvasPosition,
  to: CanvasPosition,
) {
  if (edge.fromHandle === "yes") {
    return { x: from.x - 72, y: from.y + 36 };
  }
  if (edge.fromHandle === "no") {
    return { x: from.x + 24, y: from.y + 36 };
  }
  if (edge.fromHandle === "no_answer") {
    return {
      x: from.x + 16,
      y: from.y + Math.max(38, Math.min(92, (to.y - from.y) * 0.38)),
    };
  }
  return {
    x: from.x + (to.x - from.x) * 0.42 + 12,
    y: from.y + Math.max(34, Math.min(86, (to.y - from.y) * 0.35)),
  };
}

function FlowNodeCard({
  issues,
  node,
  onAddAfter,
  onPointerDown,
  onSelect,
  queues,
  rule,
  selected,
  staticOnly,
}: {
  issues: string[];
  node: FlowNode;
  onAddAfter?: (
    event: ReactMouseEvent<HTMLElement>,
    fromNodeId: string | null,
    fromHandle?: string,
    label?: string,
  ) => void;
  onPointerDown?: (
    node: FlowNode,
    event: ReactPointerEvent<HTMLElement>,
  ) => void;
  onSelect?: (nodeId: string) => void;
  queues: Queue[];
  rule: RoutingRule | null;
  selected: boolean;
  staticOnly?: boolean;
}) {
  const content = nodeContent(node, rule, queues);
  const nodeIssues = issues.filter((issue) =>
    issue.startsWith(`${content.title}:`),
  );
  const dimensions = nodeDimensions(node);
  const isEnd = node.type === "END_CALL" || node.type === "NO_MATCH";
  const isCondition = isConditionNode(node);
  const isIvr = node.type === "IVR_MENU";
  const ivrKeys = isIvr ? ivrKeysForNode(node) : [];
  const border = selected
    ? "border-brand-500 ring-4 ring-brand-100"
    : content.border;

  if (isEnd) {
    return (
      <div
        className="absolute z-10 flex justify-center"
        style={{ left: node.x, top: node.y, width: dimensions.width }}
      >
        <button
          data-routing-node-card
          type="button"
          disabled={staticOnly}
          onClick={() => onSelect?.(node.id)}
          onPointerDown={(event) => onPointerDown?.(node, event)}
          className={`grid h-16 w-16 place-items-center rounded-full border bg-white text-sm font-semibold text-gray-700 shadow-sm ${staticOnly ? "cursor-default" : "cursor-move active:cursor-grabbing"} ${selected ? "border-brand-500 ring-4 ring-brand-100" : "border-gray-300"}`}
        >
          End
        </button>
      </div>
    );
  }

  return (
    <div
      className="group absolute z-10"
      style={{ left: node.x, top: node.y, width: dimensions.width }}
      data-routing-node={selected ? "selected" : "node"}
    >
      <button
        data-routing-node-card
        type="button"
        disabled={staticOnly}
        onClick={() => onSelect?.(node.id)}
        onPointerDown={(event) => onPointerDown?.(node, event)}
        className={`w-full overflow-visible rounded-xl border bg-white text-left shadow-sm transition hover:shadow-md disabled:cursor-default dark:bg-gray-900 ${staticOnly ? "cursor-default" : "cursor-move active:cursor-grabbing"} ${border}`}
        style={{ minHeight: dimensions.height }}
      >
        <div
          className={`flex items-center justify-between gap-3 px-3 py-1.5 text-xs font-semibold ${content.header}`}
        >
          <span className="inline-flex items-center gap-1.5">
            <span className="grid size-5 place-items-center rounded-md bg-white/70 text-[11px]">
              {content.icon}
            </span>
            {content.kind}
          </span>
          <span className="inline-flex items-center gap-2">
            {!staticOnly && nodeIssues.length ? (
              <span
                className="rounded-full border border-amber-200 bg-white/80 px-1.5 py-0.5 text-[10px] font-bold text-amber-700"
                title={nodeIssues.join("\n")}
              >
                {nodeIssues.length} issue{nodeIssues.length === 1 ? "" : "s"}
              </span>
            ) : null}
            <DragHandle />
          </span>
        </div>
        <div className="p-4">
          <div className="flex items-start gap-3">
            <div
              className={`grid size-8 shrink-0 place-items-center rounded-lg ${content.iconTone}`}
            >
              {content.icon}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-gray-900 dark:text-white/90">
                {content.title}
              </div>
              <div className="mt-2 line-clamp-3 text-xs leading-5 text-gray-600 dark:text-gray-400">
                {content.detail}
              </div>
            </div>
          </div>
        </div>
      </button>

      {!staticOnly && isCondition ? (
        <div className="absolute inset-x-0 bottom-0 flex translate-y-7 justify-center gap-12">
          <BranchAddButton
            branch="yes"
            label="Yes"
            onClick={(event) => onAddAfter?.(event, node.id, "yes", "yes")}
          />
          <BranchAddButton
            branch="no"
            label="No"
            onClick={(event) => onAddAfter?.(event, node.id, "no", "no")}
          />
        </div>
      ) : null}

      {!staticOnly && isIvr ? (
        <div className="absolute inset-x-0 bottom-0 flex translate-y-7 flex-wrap justify-center gap-2 px-2">
          {ivrKeys.map((key) => (
            <IvrBranchAddButton
              key={key}
              label={`Key ${key}`}
              onClick={(event) =>
                onAddAfter?.(event, node.id, `digit:${key}`, `key ${key}`)
              }
            />
          ))}
        </div>
      ) : null}

      {!staticOnly && !isCondition && !isIvr ? (
        <div className="-mt-px flex justify-center">
          <InsertControl
            onClick={(event) =>
              onAddAfter?.(
                event,
                node.id,
                isRoutingActionNode(node) ? "no_answer" : "next",
                isRoutingActionNode(node) ? "no answer" : "next",
              )
            }
          />
        </div>
      ) : null}
    </div>
  );
}

function BranchAddButton({
  branch,
  label,
  onClick,
}: {
  branch: "yes" | "no";
  label: string;
  onClick: (event: ReactMouseEvent<HTMLButtonElement>) => void;
}) {
  const labelClasses =
    branch === "yes"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : "border-red-200 bg-red-50 text-red-700";

  return (
    <span className="relative z-30 flex flex-col items-center">
      <span
        className={`relative z-10 inline-flex h-6 items-center rounded-t-[5px] border border-b-0 px-2.5 text-xs font-semibold shadow-sm ${labelClasses}`}
      >
        {branch === "yes" ? "✓" : "×"} {label}
      </span>
      <button
        data-canvas-control
        className="relative z-20 grid h-6 w-7 cursor-pointer place-items-center rounded-b-md border border-gray-900 bg-gray-900 text-white shadow-sm transition hover:bg-gray-700"
        onClick={onClick}
        onPointerDown={(event) => event.stopPropagation()}
        title={`Add node to ${label} path`}
        type="button"
      >
        +
      </button>
    </span>
  );
}

function IvrBranchAddButton({
  label,
  onClick,
}: {
  label: string;
  onClick: (event: ReactMouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <span className="relative z-30 flex flex-col items-center">
      <span className="relative z-10 inline-flex h-6 items-center rounded-t-[5px] border border-b-0 border-sky-200 bg-sky-50 px-2.5 text-xs font-semibold text-sky-700 shadow-sm">
        {label}
      </span>
      <button
        data-canvas-control
        className="relative z-20 grid h-6 w-7 cursor-pointer place-items-center rounded-b-md border border-gray-900 bg-gray-900 text-white shadow-sm transition hover:bg-gray-700"
        onClick={onClick}
        onPointerDown={(event) => event.stopPropagation()}
        title={`Add node to ${label} path`}
        type="button"
      >
        +
      </button>
    </span>
  );
}

function InsertControl({
  onClick,
}: {
  onClick: (event: ReactMouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      data-canvas-control
      type="button"
      title="Add node"
      onClick={onClick}
      onPointerDown={(event) => event.stopPropagation()}
      className="relative z-20 grid h-7 w-7 -translate-y-0.5 place-items-center rounded-full border-4 border-[#f5f7fb] bg-gray-900 text-sm leading-none font-semibold text-white shadow-sm transition hover:scale-105 hover:bg-gray-700"
    >
      +
    </button>
  );
}

function PreviewStat({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-800 dark:bg-white/[0.04]">
      <p className="text-[10px] font-semibold tracking-wide text-gray-400 uppercase dark:text-gray-500">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-semibold text-gray-800 dark:text-white/90">
        {value}
      </p>
    </div>
  );
}

function StepPalette({
  onAdd,
  onClose,
}: {
  onAdd: (item: PaletteItem) => void;
  onClose: () => void;
}) {
  return (
    <div
      data-step-palette
      className="w-[320px] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-800 dark:bg-gray-900"
    >
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-gray-800">
        <div className="text-sm font-semibold text-gray-900 dark:text-white/90">
          Add node
        </div>
        <button
          type="button"
          onClick={onClose}
          className="grid size-7 place-items-center rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-white/[0.06]"
          aria-label="Close node menu"
        >
          ×
        </button>
      </div>
      <div className="grid p-2">
        {paletteItems.map((item) => {
          const content = paletteContent(item.type);
          return (
            <button
              key={item.label}
              type="button"
              onClick={() => onAdd(item)}
              className="flex items-center gap-3 rounded-lg px-3 py-3 text-left hover:bg-gray-50 dark:hover:bg-white/[0.06]"
            >
              <span
                className={`grid size-8 shrink-0 place-items-center rounded-lg ${content.iconTone}`}
              >
                {content.icon}
              </span>
              <span>
                <span className="block text-sm font-medium text-gray-800 dark:text-white/90">
                  {item.label}
                </span>
                <span className="mt-0.5 block text-xs leading-5 text-gray-500 dark:text-gray-400">
                  {item.description}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function NodeInspector({
  edges,
  issues,
  node,
  nodes,
  onDelete,
  onSetDestination,
  onUpdateIvrOptions,
  onSetRouteTarget,
  onUpdateNode,
  onUpdateRule,
  queues,
  rule,
  users,
}: {
  edges: FlowEdge[];
  issues: string[];
  node: FlowNode;
  nodes: FlowNode[];
  onDelete: () => void;
  onSetDestination: (
    from: string,
    fromHandle: string,
    to: string,
    label: string,
  ) => void;
  onUpdateIvrOptions: (nodeId: string, options: IvrMenuOption[]) => void;
  onSetRouteTarget: (nodeId: string, target: string) => void;
  onUpdateNode: (nodeId: string, patch: Partial<FlowNode>) => void;
  onUpdateRule: (ruleId: string, patch: Partial<RoutingRule>) => void;
  queues: Queue[];
  rule: RoutingRule | null;
  users: RouteUser[];
}) {
  const content = nodeContent(node, rule, queues);
  const routeTarget = routeTargetForNode(node);
  const nodeIssues = issues.filter((issue) =>
    issue.startsWith(`${content.title}:`),
  );
  const canDelete = !canonicalNodeIds.has(node.id);
  const ivrOptions =
    node.type === "IVR_MENU" ? ivrMenuOptionsForNode(node) : [];
  const [selectedIvrKey, setSelectedIvrKey] = useState<string | null>(null);
  const activeIvrKey =
    selectedIvrKey && ivrOptions.some((option) => option.key === selectedIvrKey)
      ? selectedIvrKey
      : (ivrOptions[0]?.key ?? null);
  const activeIvrOptionIndex = activeIvrKey
    ? ivrOptions.findIndex((option) => option.key === activeIvrKey)
    : -1;
  const activeIvrOption =
    activeIvrOptionIndex >= 0 ? ivrOptions[activeIvrOptionIndex] : null;
  const generatedIvrPrompt = ivrPromptPreview(ivrOptions);
  const destinationOptions = nodes
    .filter((candidate) => candidate.id !== node.id)
    .map((candidate) => ({
      value: candidate.id,
      label: nodeContent(candidate, ruleForNode([], candidate), queues).title,
    }));

  return (
    <div className="flex h-full flex-col">
      <div className={`border-b px-5 py-4 ${content.inspector}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span
              className={`grid size-9 shrink-0 place-items-center rounded-lg border bg-white/60 ${content.iconTone}`}
            >
              {content.icon}
            </span>
            <div>
              <div className="text-xs font-semibold tracking-wide text-gray-600 uppercase">
                {content.kind}
              </div>
              <h3 className="mt-1 text-sm font-semibold text-gray-900 dark:text-white/90">
                {content.title}
              </h3>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto bg-gray-50 p-5 dark:bg-gray-950">
        {nodeIssues.length ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            {nodeIssues.map((issue) => (
              <div key={issue}>{issue.replace(`${content.title}: `, "")}</div>
            ))}
          </div>
        ) : null}

        <EditorSection title="Core details">
          <EditorField label="Node label">
            <input
              value={String(node.data?.label ?? content.title)}
              onChange={(event) =>
                onUpdateNode(node.id, { data: { label: event.target.value } })
              }
              className={inputClassName}
            />
          </EditorField>
          <div className="rounded-lg border border-gray-200 bg-white p-3 text-sm leading-5 text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300">
            {content.detail}
          </div>
        </EditorSection>

        {rule ? (
          <EditorSection title="Routing strategy">
            {isConditionNode(node) ? (
              <>
                <ConditionFields node={node} onUpdateNode={onUpdateNode} />
                {node.type === "IF_ELSE" || node.type === "RULE" ? (
                  <EditorField label="Internal rule label">
                    <input
                      value={rule.condition}
                      onChange={(event) =>
                        onUpdateRule(rule.id, { condition: event.target.value })
                      }
                      className={inputClassName}
                    />
                  </EditorField>
                ) : null}
                <DestinationSelect
                  label="Yes destination"
                  value={edgeTarget(edges, node.id, "yes")}
                  options={destinationOptions}
                  onChange={(value) =>
                    onSetDestination(node.id, "yes", value, "yes")
                  }
                />
                <DestinationSelect
                  label="No destination"
                  value={edgeTarget(edges, node.id, "no")}
                  options={destinationOptions}
                  onChange={(value) =>
                    onSetDestination(node.id, "no", value, "no")
                  }
                />
              </>
            ) : null}

            {node.type === "ROUTE_TO" ? (
              <>
                <EditorField label="Route target">
                  <select
                    value={routeTarget}
                    onChange={(event) =>
                      onSetRouteTarget(node.id, event.target.value)
                    }
                    className={inputClassName}
                  >
                    <option value="SALE_AGENT">
                      Sales agent from open sale
                    </option>
                    <option value="INDIVIDUAL">Specific individual</option>
                    <option value="TEAM">Team / call group</option>
                  </select>
                </EditorField>

                {routeTarget === "INDIVIDUAL" ? (
                  <EditorField label="Individual">
                    <select
                      value={String(node.data?.userId ?? "")}
                      onChange={(event) =>
                        onUpdateNode(node.id, {
                          data: { userId: event.target.value },
                        })
                      }
                      className={inputClassName}
                    >
                      <option value="">Choose a person</option>
                      {users.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.name}
                        </option>
                      ))}
                    </select>
                  </EditorField>
                ) : null}

                {routeTarget === "TEAM" ? (
                  <>
                    <EditorField label="Team">
                      <select
                        value={rule.queueId}
                        onChange={(event) =>
                          onUpdateRule(rule.id, { queueId: event.target.value })
                        }
                        className={inputClassName}
                      >
                        {queues.map((queue) => (
                          <option key={queue.id} value={queue.id}>
                            {queue.name}
                          </option>
                        ))}
                      </select>
                    </EditorField>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <EditorField label="Ring strategy">
                        <select
                          value={rule.ringStrategy}
                          onChange={(event) =>
                            onUpdateRule(rule.id, {
                              ringStrategy: event.target.value,
                            })
                          }
                          className={inputClassName}
                        >
                          <option value="QUEUE_DEFAULT">Team default</option>
                          <option value="SIMULTANEOUS">Ring all devices</option>
                          <option value="ROUND_ROBIN">Round robin</option>
                          <option value="PRIORITY">Priority order</option>
                        </select>
                      </EditorField>
                      <EditorField label="Try for seconds">
                        <input
                          type="number"
                          min={5}
                          value={rule.timeoutSeconds}
                          onChange={(event) =>
                            onUpdateRule(rule.id, {
                              timeoutSeconds: Number(event.target.value),
                            })
                          }
                          className={inputClassName}
                        />
                      </EditorField>
                    </div>
                  </>
                ) : null}

                <DestinationSelect
                  label="No-answer destination"
                  value={edgeTarget(edges, node.id, "no_answer")}
                  options={destinationOptions}
                  onChange={(value) =>
                    onSetDestination(node.id, "no_answer", value, "no answer")
                  }
                />
              </>
            ) : null}

            {node.type === "RING_TEAM" || node.type === "QUEUE" ? (
              <>
                <EditorField label="Team">
                  <select
                    value={rule.queueId}
                    onChange={(event) =>
                      onUpdateRule(rule.id, { queueId: event.target.value })
                    }
                    className={inputClassName}
                  >
                    {queues.map((queue) => (
                      <option key={queue.id} value={queue.id}>
                        {queue.name}
                      </option>
                    ))}
                  </select>
                </EditorField>
                <div className="grid gap-3 sm:grid-cols-2">
                  <EditorField label="Ring strategy">
                    <select
                      value={rule.ringStrategy}
                      onChange={(event) =>
                        onUpdateRule(rule.id, {
                          ringStrategy: event.target.value,
                        })
                      }
                      className={inputClassName}
                    >
                      <option value="QUEUE_DEFAULT">Team default</option>
                      <option value="SIMULTANEOUS">Ring all devices</option>
                      <option value="ROUND_ROBIN">Round robin</option>
                      <option value="PRIORITY">Priority order</option>
                    </select>
                  </EditorField>
                  <EditorField label="Try for seconds">
                    <input
                      type="number"
                      min={5}
                      value={rule.timeoutSeconds}
                      onChange={(event) =>
                        onUpdateRule(rule.id, {
                          timeoutSeconds: Number(event.target.value),
                        })
                      }
                      className={inputClassName}
                    />
                  </EditorField>
                </div>
                <DestinationSelect
                  label="No-answer destination"
                  value={edgeTarget(edges, node.id, "no_answer")}
                  options={destinationOptions}
                  onChange={(value) =>
                    onSetDestination(node.id, "no_answer", value, "no answer")
                  }
                />
              </>
            ) : null}

            {node.type === "ROUTE_TO_SALE_AGENT" ? (
              <DestinationSelect
                label="No-answer destination"
                value={edgeTarget(edges, node.id, "no_answer")}
                options={destinationOptions}
                onChange={(value) =>
                  onSetDestination(node.id, "no_answer", value, "no answer")
                }
              />
            ) : null}

            <label className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white p-3 text-sm font-medium text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300">
              Rule enabled
              <input
                type="checkbox"
                checked={rule.enabled}
                onChange={(event) =>
                  onUpdateRule(rule.id, { enabled: event.target.checked })
                }
                className="h-4 w-4 rounded border-gray-300 text-brand-500"
              />
            </label>
          </EditorSection>
        ) : null}

        {!rule && isConditionNode(node) ? (
          <EditorSection title="Branch destinations">
            <ConditionFields node={node} onUpdateNode={onUpdateNode} />
            <DestinationSelect
              label="Yes destination"
              value={edgeTarget(edges, node.id, "yes")}
              options={destinationOptions}
              onChange={(value) =>
                onSetDestination(node.id, "yes", value, "yes")
              }
            />
            <DestinationSelect
              label="No destination"
              value={edgeTarget(edges, node.id, "no")}
              options={destinationOptions}
              onChange={(value) => onSetDestination(node.id, "no", value, "no")}
            />
          </EditorSection>
        ) : null}

        {node.type === "WAIT" ? (
          <EditorSection title="Wait">
            <EditorField label="Seconds">
              <input
                type="number"
                min={1}
                value={Number(node.data?.seconds ?? 10)}
                onChange={(event) =>
                  onUpdateNode(node.id, {
                    data: { seconds: Number(event.target.value) },
                  })
                }
                className={inputClassName}
              />
            </EditorField>
            <DestinationSelect
              label="Next destination"
              value={edgeTarget(edges, node.id, "next")}
              options={destinationOptions}
              onChange={(value) =>
                onSetDestination(node.id, "next", value, "next")
              }
            />
          </EditorSection>
        ) : null}

        {node.type === "VOICEMAIL" || node.type === "FALLBACK" ? (
          <EditorSection title="Voicemail">
            <EditorField label="Message">
              <textarea
                rows={4}
                value={String(
                  node.data?.message ??
                    "Please leave a message and we will call you back.",
                )}
                onChange={(event) =>
                  onUpdateNode(node.id, {
                    data: { message: event.target.value },
                  })
                }
                className={textareaClassName}
              />
            </EditorField>
            <DestinationSelect
              label="After voicemail"
              value={edgeTarget(edges, node.id, "next")}
              options={destinationOptions}
              onChange={(value) =>
                onSetDestination(node.id, "next", value, "next")
              }
            />
          </EditorSection>
        ) : null}

        {node.type === "AUDIO_MESSAGE" ? (
          <EditorSection title="Audio message">
            <EditorField label="Message">
              <textarea
                rows={4}
                value={String(
                  node.data?.message ?? "Please hold while we route your call.",
                )}
                onChange={(event) =>
                  onUpdateNode(node.id, {
                    data: { message: event.target.value },
                  })
                }
                className={textareaClassName}
              />
            </EditorField>
            <DestinationSelect
              label="Next destination"
              value={edgeTarget(edges, node.id, "next")}
              options={destinationOptions}
              onChange={(value) =>
                onSetDestination(node.id, "next", value, "next")
              }
            />
          </EditorSection>
        ) : null}

        {node.type === "IVR_MENU" ? (
          <>
            <EditorSection title="General IVR settings">
              <div className="grid gap-3 sm:grid-cols-2">
                <EditorField label="Prompt type">
                  <select
                    value={String(node.data?.promptType ?? "TEXT_TO_SPEECH")}
                    onChange={(event) =>
                      onUpdateNode(node.id, {
                        data: { promptType: event.target.value },
                      })
                    }
                    className={inputClassName}
                  >
                    <option value="TEXT_TO_SPEECH">Text to speech</option>
                    <option value="AUDIO_URL">Audio URL</option>
                    <option value="RECORDING">Saved recording</option>
                  </select>
                </EditorField>
                <EditorField label="Retries">
                  <input
                    type="number"
                    min={0}
                    max={5}
                    value={Number(node.data?.retryCount ?? 1)}
                    onChange={(event) =>
                      onUpdateNode(node.id, {
                        data: { retryCount: Number(event.target.value) },
                      })
                    }
                    className={inputClassName}
                  />
                </EditorField>
              </div>
              <EditorField label="Prompt">
                <textarea
                  rows={4}
                  value={String(
                    node.data?.prompt ??
                      "Press 1 for sales or stay on the line.",
                  )}
                  onChange={(event) =>
                    onUpdateNode(node.id, {
                      data: { prompt: event.target.value },
                    })
                  }
                  className={textareaClassName}
                />
              </EditorField>
              <div className="grid gap-3 sm:grid-cols-2">
                <EditorField label="Voice">
                  <select
                    value={String(node.data?.voice ?? "alice")}
                    onChange={(event) =>
                      onUpdateNode(node.id, {
                        data: { voice: event.target.value },
                      })
                    }
                    className={inputClassName}
                  >
                    <option value="alice">Alice</option>
                    <option value="Polly.Amy">Amy</option>
                    <option value="Polly.Brian">Brian</option>
                    <option value="Polly.Emma">Emma</option>
                  </select>
                </EditorField>
                <EditorField label="Language">
                  <select
                    value={String(node.data?.language ?? "en-GB")}
                    onChange={(event) =>
                      onUpdateNode(node.id, {
                        data: { language: event.target.value },
                      })
                    }
                    className={inputClassName}
                  >
                    <option value="en-GB">English UK</option>
                    <option value="en-US">English US</option>
                    <option value="en-IE">English IE</option>
                  </select>
                </EditorField>
              </div>
              <EditorField label="Audio URL or recording reference">
                <input
                  value={String(node.data?.audioUrl ?? "")}
                  onChange={(event) =>
                    onUpdateNode(node.id, {
                      data: { audioUrl: event.target.value },
                    })
                  }
                  className={inputClassName}
                />
              </EditorField>
              <div className="border-t border-gray-100 pt-3 dark:border-gray-800">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold tracking-wide text-gray-500 uppercase">
                      Prompt preview
                    </div>
                    <p className="mt-1 text-sm leading-5 text-gray-700 dark:text-gray-300">
                      {generatedIvrPrompt}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateNode(node.id, {
                        data: { prompt: generatedIvrPrompt },
                      })
                    }
                    disabled={!ivrOptions.some((option) => option.label.trim())}
                    className="inline-flex h-8 shrink-0 items-center rounded-lg border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200"
                  >
                    Use prompt
                  </button>
                </div>
              </div>
            </EditorSection>

            <EditorSection title="Phone keypad">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-gray-800 dark:text-white/90">
                    Keypad options
                  </div>
                  <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {activeIvrKey
                      ? `Key ${activeIvrKey} selected`
                      : "Select a key"}
                  </div>
                </div>
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                  {ivrOptions.length}/{ivrOptionLimit} active
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {phoneKeypadKeys.map((key) => {
                  const option = ivrOptions.find(
                    (candidate) => candidate.key === key,
                  );
                  const optionIndex = option
                    ? ivrOptions.findIndex((candidate) => candidate.key === key)
                    : -1;
                  const isSelected = activeIvrKey === key;

                  return (
                    <button
                      key={key}
                      type="button"
                      aria-label={option ? `Edit key ${key}` : `Add key ${key}`}
                      onClick={() => {
                        if (option) {
                          setSelectedIvrKey(key);
                          return;
                        }

                        if (ivrOptions.length >= ivrOptionLimit) return;

                        onUpdateIvrOptions(node.id, [
                          ...ivrOptions,
                          {
                            key,
                            label: "",
                            message: "",
                            destination: "",
                          },
                        ]);
                        setSelectedIvrKey(key);
                      }}
                      disabled={!option && ivrOptions.length >= ivrOptionLimit}
                      className={`min-h-[74px] rounded-lg border px-2 py-2 text-center transition disabled:cursor-not-allowed disabled:opacity-50 ${
                        isSelected
                          ? "border-brand-500 bg-brand-50 text-brand-700 ring-2 ring-brand-100 dark:border-brand-400 dark:bg-brand-500/10 dark:text-brand-200"
                          : option
                            ? "border-gray-300 bg-white text-gray-800 hover:border-brand-300 hover:bg-brand-50/60 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                            : "border-dashed border-gray-300 bg-gray-50 text-gray-500 hover:border-gray-400 hover:bg-white dark:border-gray-700 dark:bg-gray-950 dark:text-gray-400"
                      }`}
                    >
                      <span className="block text-xl leading-6 font-semibold">
                        {key}
                      </span>
                      <span className="mt-1 block truncate text-[11px] leading-4 font-medium">
                        {option?.label || (option ? "Set route" : "Add")}
                      </span>
                      {option?.destination ? (
                        <span className="mt-1 inline-block size-1.5 rounded-full bg-success-500" />
                      ) : optionIndex >= 0 ? (
                        <span className="mt-1 inline-block size-1.5 rounded-full bg-warning-400" />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </EditorSection>

            {activeIvrOption ? (
              <div className="space-y-3 rounded-xl border border-brand-200 bg-brand-50/45 p-4 ring-1 ring-brand-100 dark:border-brand-500/30 dark:bg-brand-500/10 dark:ring-brand-500/20">
                <div className="flex items-center justify-between gap-3 border-b border-brand-100 pb-3 dark:border-brand-500/20">
                  <div className="flex items-center gap-3">
                    <span className="grid size-11 place-items-center rounded-full border border-brand-300 bg-white text-lg font-semibold text-brand-700 shadow-sm dark:border-brand-500/40 dark:bg-gray-950 dark:text-brand-200">
                      {activeIvrOption.key}
                    </span>
                    <div>
                      <div className="text-xs font-semibold tracking-wide text-brand-600 uppercase dark:text-brand-300">
                        Selected key route
                      </div>
                      <div className="text-sm font-semibold text-gray-900 dark:text-white/90">
                        Key {activeIvrOption.key}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {activeIvrOption.destination
                          ? "Destination set"
                          : "Needs destination"}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const remainingOptions = ivrOptions.filter(
                        (_, current) => current !== activeIvrOptionIndex,
                      );
                      onUpdateIvrOptions(node.id, remainingOptions);
                      setSelectedIvrKey(remainingOptions[0]?.key ?? null);
                    }}
                    disabled={ivrOptions.length <= 1}
                    className="inline-flex h-8 items-center rounded-lg border border-error-200 bg-white px-3 text-xs font-semibold text-error-600 hover:bg-error-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-error-900/50 dark:bg-gray-900 dark:text-error-300"
                  >
                    Remove key
                  </button>
                </div>
                <EditorField label="Label">
                  <input
                    value={activeIvrOption.label}
                    placeholder="Sales"
                    onChange={(event) =>
                      onUpdateIvrOptions(
                        node.id,
                        updateIvrOption(ivrOptions, activeIvrOptionIndex, {
                          label: event.target.value,
                        }),
                      )
                    }
                    className={inputClassName}
                  />
                </EditorField>
                <DestinationSelect
                  label="Destination"
                  value={activeIvrOption.destination}
                  options={destinationOptions}
                  onChange={(value) =>
                    onUpdateIvrOptions(
                      node.id,
                      updateIvrOption(ivrOptions, activeIvrOptionIndex, {
                        destination: value,
                      }),
                    )
                  }
                />
                <EditorField label="Message for this key">
                  <textarea
                    rows={2}
                    value={activeIvrOption.message}
                    placeholder="Connecting you to Sales."
                    onChange={(event) =>
                      onUpdateIvrOptions(
                        node.id,
                        updateIvrOption(ivrOptions, activeIvrOptionIndex, {
                          message: event.target.value,
                        }),
                      )
                    }
                    className={textareaClassName}
                  />
                </EditorField>
              </div>
            ) : null}

            <EditorSection title="Fallback handling">
              <DestinationSelect
                label="Timeout / no input"
                value={edgeTarget(edges, node.id, "timeout")}
                options={destinationOptions}
                onChange={(value) =>
                  onSetDestination(node.id, "timeout", value, "timeout")
                }
              />
              <DestinationSelect
                label="Invalid input"
                value={edgeTarget(edges, node.id, "invalid")}
                options={destinationOptions}
                onChange={(value) =>
                  onSetDestination(node.id, "invalid", value, "invalid")
                }
              />
              <EditorField label="Retry message">
                <textarea
                  rows={3}
                  value={String(
                    node.data?.retryMessage ??
                      "That option was not recognised. Please try again.",
                  )}
                  onChange={(event) =>
                    onUpdateNode(node.id, {
                      data: { retryMessage: event.target.value },
                    })
                  }
                  className={textareaClassName}
                />
              </EditorField>
              <DestinationSelect
                label="After retries"
                value={edgeTarget(edges, node.id, "retries_exhausted")}
                options={destinationOptions}
                onChange={(value) =>
                  onSetDestination(
                    node.id,
                    "retries_exhausted",
                    value,
                    "after retries",
                  )
                }
              />
              <DestinationSelect
                label="Default destination"
                value={edgeTarget(edges, node.id, "next")}
                options={destinationOptions}
                onChange={(value) =>
                  onSetDestination(node.id, "next", value, "default")
                }
              />
            </EditorSection>
          </>
        ) : null}

        {node.type === "REDIRECT" ? (
          <EditorSection title="Redirect">
            <EditorField label="Destination number or SIP address">
              <input
                value={String(node.data?.destination ?? "")}
                onChange={(event) =>
                  onUpdateNode(node.id, {
                    data: { destination: event.target.value },
                  })
                }
                className={inputClassName}
              />
            </EditorField>
            <DestinationSelect
              label="If redirect fails"
              value={edgeTarget(edges, node.id, "next")}
              options={destinationOptions}
              onChange={(value) =>
                onSetDestination(node.id, "next", value, "fallback")
              }
            />
          </EditorSection>
        ) : null}

        {canDelete ? (
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex h-10 w-full items-center justify-center rounded-lg border border-error-200 bg-white text-sm font-semibold text-error-600 hover:bg-error-50 dark:border-error-900/50 dark:bg-gray-900 dark:text-error-300"
          >
            Delete node
          </button>
        ) : null}
      </div>
    </div>
  );
}

function DestinationSelect({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  value: string;
}) {
  return (
    <EditorField label={label}>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={inputClassName}
      >
        <option value="">No destination</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </EditorField>
  );
}

function ConditionFields({
  node,
  onUpdateNode,
}: {
  node: FlowNode;
  onUpdateNode: (nodeId: string, patch: Partial<FlowNode>) => void;
}) {
  if (node.type === "CONTACT_IN_OPEN_SALE") {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-3 text-sm leading-5 text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300">
        This branch is true when the caller number matches a CRM contact with
        exactly one open lead.
      </div>
    );
  }

  if (node.type === "BUSINESS_HOURS") {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-3 text-sm leading-5 text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300">
        This branch uses the saved phone-system business hours and holiday
        settings.
      </div>
    );
  }

  if (node.type === "TIME_RULE") {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <EditorField label="Start time">
          <input
            type="time"
            value={String(node.data?.start ?? node.data?.startTime ?? "09:00")}
            onChange={(event) =>
              onUpdateNode(node.id, { data: { start: event.target.value } })
            }
            className={inputClassName}
          />
        </EditorField>
        <EditorField label="End time">
          <input
            type="time"
            value={String(node.data?.end ?? node.data?.endTime ?? "17:30")}
            onChange={(event) =>
              onUpdateNode(node.id, { data: { end: event.target.value } })
            }
            className={inputClassName}
          />
        </EditorField>
      </div>
    );
  }

  if (node.type === "DATE_RULE") {
    return (
      <div className="space-y-3">
        <EditorField label="Exact date">
          <input
            type="date"
            value={String(node.data?.date ?? "")}
            onChange={(event) =>
              onUpdateNode(node.id, { data: { date: event.target.value } })
            }
            className={inputClassName}
          />
        </EditorField>
        <div className="grid gap-3 sm:grid-cols-2">
          <EditorField label="Start date">
            <input
              type="date"
              value={String(node.data?.startDate ?? "")}
              onChange={(event) =>
                onUpdateNode(node.id, {
                  data: { startDate: event.target.value },
                })
              }
              className={inputClassName}
            />
          </EditorField>
          <EditorField label="End date">
            <input
              type="date"
              value={String(node.data?.endDate ?? "")}
              onChange={(event) =>
                onUpdateNode(node.id, { data: { endDate: event.target.value } })
              }
              className={inputClassName}
            />
          </EditorField>
        </div>
      </div>
    );
  }

  const conditionType = conditionTypeForNode(node);
  const option = routingConditionOptions.find(
    (candidate) => candidate.type === conditionType,
  );
  const operator = conditionOperatorForNode(node);

  return (
    <div className="space-y-3">
      <EditorField label="Condition type">
        <select
          value={conditionType}
          onChange={(event) =>
            onUpdateNode(node.id, {
              data: {
                conditionType: event.target.value,
                conditionOperator:
                  event.target.value === "ALWAYS" ? "EXISTS" : operator,
              },
            })
          }
          className={inputClassName}
        >
          {routingConditionOptions.map((condition) => (
            <option key={condition.type} value={condition.type}>
              {condition.label}
            </option>
          ))}
        </select>
      </EditorField>

      <div className="rounded-lg border border-gray-200 bg-white p-3 text-sm leading-5 text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300">
        {option?.description ??
          "Branch based on a structured caller condition."}
      </div>

      {option?.requiresValue ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <EditorField label="Match">
            <select
              value={operator}
              onChange={(event) =>
                onUpdateNode(node.id, {
                  data: {
                    conditionOperator: event.target.value,
                  },
                })
              }
              className={inputClassName}
            >
              <option value="CONTAINS">Contains</option>
              <option value="EQUALS">Equals</option>
              <option value="STARTS_WITH">Starts with</option>
              <option value="ENDS_WITH">Ends with</option>
            </select>
          </EditorField>
          <EditorField label={option.valueLabel ?? "Value"}>
            <input
              value={String(node.data?.conditionValue ?? "")}
              onChange={(event) =>
                onUpdateNode(node.id, {
                  data: {
                    conditionValue: event.target.value,
                  },
                })
              }
              className={inputClassName}
            />
          </EditorField>
        </div>
      ) : null}
    </div>
  );
}

function FlowSimulatorPanel({
  context,
  nodes,
  onChange,
  path,
}: {
  context: SimulatorContext;
  nodes: FlowNode[];
  onChange: (context: SimulatorContext) => void;
  path: Array<{ branch?: string; id: string; label: string }>;
}) {
  return (
    <div
      data-canvas-control
      className="absolute bottom-4 left-4 z-40 w-[360px] rounded-2xl border border-gray-200 bg-white/95 p-4 shadow-2xl backdrop-blur dark:border-gray-800 dark:bg-gray-900/95"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold tracking-wide text-gray-500 uppercase">
            Test flow
          </div>
          <h3 className="mt-1 text-sm font-semibold text-gray-900 dark:text-white/90">
            Simulated caller path
          </h3>
        </div>
        <span className="rounded-full bg-brand-50 px-2 py-1 text-xs font-semibold text-brand-700 dark:bg-brand-500/10 dark:text-brand-200">
          {path.length}/{nodes.length}
        </span>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <SimulatorToggle
          checked={context.contact}
          label="Known contact"
          onChange={(checked) => onChange({ ...context, contact: checked })}
        />
        <SimulatorToggle
          checked={context.openSale}
          label="Open lead"
          onChange={(checked) => onChange({ ...context, openSale: checked })}
        />
        <SimulatorToggle
          checked={context.attribution}
          label="Attribution"
          onChange={(checked) => onChange({ ...context, attribution: checked })}
        />
        <SimulatorToggle
          checked={context.trackingNumber}
          label="Tracking no."
          onChange={(checked) =>
            onChange({ ...context, trackingNumber: checked })
          }
        />
        <SimulatorToggle
          checked={context.businessOpen}
          label="Open hours"
          onChange={(checked) =>
            onChange({ ...context, businessOpen: checked })
          }
        />
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <input
          aria-label="Simulated lead source"
          placeholder="Source"
          value={context.source}
          onChange={(event) =>
            onChange({ ...context, source: event.target.value })
          }
          className={inputClassName}
        />
        <input
          aria-label="Simulated inbound number"
          placeholder="Inbound number"
          value={context.inboundNumber}
          onChange={(event) =>
            onChange({ ...context, inboundNumber: event.target.value })
          }
          className={inputClassName}
        />
        <select
          aria-label="Simulated IVR keypad choice"
          value={context.ivrKey}
          onChange={(event) =>
            onChange({ ...context, ivrKey: event.target.value })
          }
          className={inputClassName}
        >
          <option value="">IVR timeout</option>
          {phoneKeypadKeys.map((key) => (
            <option key={key} value={key}>
              Press {key}
            </option>
          ))}
        </select>
      </div>

      <ol className="mt-3 max-h-44 space-y-1 overflow-y-auto rounded-lg border border-gray-100 bg-gray-50 p-2 text-xs dark:border-gray-800 dark:bg-gray-950">
        {path.map((step, index) => (
          <li
            key={`${step.id}-${index}`}
            className="flex items-center justify-between gap-3 rounded-md bg-white px-2 py-1.5 text-gray-700 dark:bg-gray-900 dark:text-gray-300"
          >
            <span className="truncate">{step.label}</span>
            {step.branch ? (
              <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 font-semibold text-gray-500 dark:bg-gray-800">
                {step.branch}
              </span>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}

function SimulatorToggle({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-2 py-2 text-xs font-medium text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300">
      {label}
      <input
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
        className="h-4 w-4 rounded border-gray-300 text-brand-500"
      />
    </label>
  );
}

function ToolbarButton({
  children,
  disabled,
  label,
  onClick,
  onPointerDown,
  title,
}: {
  children: ReactNode;
  disabled?: boolean;
  label: string;
  onClick?: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  onPointerDown?: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  title?: string;
}) {
  return (
    <button
      data-canvas-control
      aria-label={label}
      title={title ?? label}
      type="button"
      disabled={disabled}
      onClick={onClick}
      onPointerDown={onPointerDown}
      className="grid h-9 w-9 place-items-center text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:text-gray-300 dark:hover:bg-white/[0.06]"
    >
      {children}
    </button>
  );
}

function EditorSection({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <h4 className="text-sm font-semibold text-gray-900 dark:text-white/90">
        {title}
      </h4>
      {children}
    </div>
  );
}

function EditorField({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">
        {label}
      </span>
      {children}
    </label>
  );
}

function DragHandle() {
  return (
    <span
      aria-hidden="true"
      className="grid grid-cols-2 gap-[3px] text-current/35"
      title="Drag to reposition"
    >
      <span className="size-0.5 rounded-full bg-current" />
      <span className="size-0.5 rounded-full bg-current" />
      <span className="size-0.5 rounded-full bg-current" />
      <span className="size-0.5 rounded-full bg-current" />
      <span className="size-0.5 rounded-full bg-current" />
      <span className="size-0.5 rounded-full bg-current" />
    </span>
  );
}

function buildInitialNodes(savedNodes: FlowNode[]) {
  const saved = new Map(savedNodes.map((node) => [node.id, node]));
  const pickSaved = (ids: string[], fallback: FlowNode): FlowNode => {
    for (const id of ids) {
      const node = saved.get(id);
      if (node) {
        return {
          ...fallback,
          ...node,
          id: fallback.id,
          type: fallback.type,
          data: {
            ...fallback.data,
            ...node.data,
          },
        };
      }
    }
    return fallback;
  };

  const canonical: FlowNode[] = [
    pickSaved([inboundNodeId, legacyStartNodeId], {
      id: inboundNodeId,
      type: "INBOUND_CALL",
      x: cleanDefaultNodePositions[inboundNodeId].x,
      y: cleanDefaultNodePositions[inboundNodeId].y,
      data: { label: "Inbound call" },
    }),
    pickSaved([openSaleNodeId, legacyOpenSaleNodeId], {
      id: openSaleNodeId,
      type: "CONTACT_IN_OPEN_SALE",
      x: cleanDefaultNodePositions[openSaleNodeId].x,
      y: cleanDefaultNodePositions[openSaleNodeId].y,
      data: {
        conditionOperator: "EXISTS",
        conditionType: "OPEN_SALE",
        label: "Contact in open sale?",
      },
    }),
    pickSaved([saleAgentNodeId, legacySaleAgentNodeId], {
      id: saleAgentNodeId,
      type: "ROUTE_TO",
      x: cleanDefaultNodePositions[saleAgentNodeId].x,
      y: cleanDefaultNodePositions[saleAgentNodeId].y,
      data: { label: "Route to", routeTarget: "SALE_AGENT" },
    }),
    pickSaved([ownerWaitNodeId, legacyOwnerWaitNodeId], {
      id: ownerWaitNodeId,
      type: "WAIT",
      x: cleanDefaultNodePositions[ownerWaitNodeId].x,
      y: cleanDefaultNodePositions[ownerWaitNodeId].y,
      data: { label: "Wait 10s", seconds: 10 },
    }),
    pickSaved(
      [salesTeamNodeId, legacyDirectTeamNodeId, legacyOwnerTeamNodeId],
      {
        id: salesTeamNodeId,
        type: "RING_TEAM",
        x: cleanDefaultNodePositions[salesTeamNodeId].x,
        y: cleanDefaultNodePositions[salesTeamNodeId].y,
        data: { label: "Ring Sales team", ruleId: "general-inbound" },
      },
    ),
    pickSaved([voicemailNodeId, legacyVoicemailNodeId], {
      id: voicemailNodeId,
      type: "VOICEMAIL",
      x: cleanDefaultNodePositions[voicemailNodeId].x,
      y: cleanDefaultNodePositions[voicemailNodeId].y,
      data: { label: "Voicemail" },
    }),
    pickSaved([endNodeId, legacyEndNodeId], {
      id: endNodeId,
      type: "END_CALL",
      x: cleanDefaultNodePositions[endNodeId].x,
      y: cleanDefaultNodePositions[endNodeId].y,
      data: { label: "End call" },
    }),
  ];

  const knownLegacyIds = new Set([
    legacyStartNodeId,
    legacyOpenSaleNodeId,
    legacySaleAgentNodeId,
    legacyOwnerWaitNodeId,
    legacyDirectTeamNodeId,
    legacyOwnerTeamNodeId,
    legacyVoicemailNodeId,
    legacyEndNodeId,
  ]);
  const customNodes = savedNodes.filter(
    (node) => !canonicalNodeIds.has(node.id) && !knownLegacyIds.has(node.id),
  );

  const routeToCanonical = canonical.map((node) =>
    normalizeDefaultRouteToNode(node),
  );
  const normalizedCanonical = shouldUpgradeDefaultLayout(savedNodes)
    ? routeToCanonical.map((node) => ({
        ...node,
        ...cleanDefaultNodePositions[node.id],
      }))
    : routeToCanonical;

  return [...normalizedCanonical, ...customNodes];
}

function normalizeDefaultRouteToNode(node: FlowNode) {
  if (node.id !== saleAgentNodeId || node.type !== "ROUTE_TO") return node;

  return {
    ...node,
    data: {
      ...node.data,
      label: "Route to",
      routeTarget: "SALE_AGENT",
    },
  };
}

function shouldUpgradeDefaultLayout(savedNodes: FlowNode[]) {
  if (!savedNodes.length) return false;
  const saved = new Map(savedNodes.map((node) => [node.id, node]));
  const saleAgent =
    saved.get(saleAgentNodeId) ?? saved.get(legacySaleAgentNodeId);
  const wait = saved.get(ownerWaitNodeId) ?? saved.get(legacyOwnerWaitNodeId);
  const salesTeam =
    saved.get(salesTeamNodeId) ??
    saved.get(legacyDirectTeamNodeId) ??
    saved.get(legacyOwnerTeamNodeId);

  return Boolean(
    saleAgent &&
    wait &&
    salesTeam &&
    Math.abs(saleAgent.x - 170) <= 40 &&
    Math.abs(wait.x - 170) <= 40 &&
    Math.abs(salesTeam.y - 720) <= 80,
  );
}

function buildInitialEdges(savedEdges: FlowEdge[], savedNodes: FlowNode[]) {
  if (savedEdges.length) return savedEdges;

  const hasNewNodes = savedNodes.some((node) => canonicalNodeIds.has(node.id));
  if (!hasNewNodes && savedNodes.length) {
    return defaultEdges();
  }

  return defaultEdges();
}

function defaultEdges(): FlowEdge[] {
  return [
    {
      id: edgeId(inboundNodeId, openSaleNodeId, "next"),
      from: inboundNodeId,
      to: openSaleNodeId,
      fromHandle: "next",
      label: "",
    },
    {
      id: edgeId(openSaleNodeId, saleAgentNodeId, "yes"),
      from: openSaleNodeId,
      to: saleAgentNodeId,
      fromHandle: "yes",
      label: "yes",
    },
    {
      id: edgeId(openSaleNodeId, salesTeamNodeId, "no"),
      from: openSaleNodeId,
      to: salesTeamNodeId,
      fromHandle: "no",
      label: "no",
    },
    {
      id: edgeId(saleAgentNodeId, ownerWaitNodeId, "no_answer"),
      from: saleAgentNodeId,
      to: ownerWaitNodeId,
      fromHandle: "no_answer",
      label: "no answer",
    },
    {
      id: edgeId(ownerWaitNodeId, salesTeamNodeId, "next"),
      from: ownerWaitNodeId,
      to: salesTeamNodeId,
      fromHandle: "next",
      label: "next",
    },
    {
      id: edgeId(salesTeamNodeId, voicemailNodeId, "no_answer"),
      from: salesTeamNodeId,
      to: voicemailNodeId,
      fromHandle: "no_answer",
      label: "no answer",
    },
    {
      id: edgeId(voicemailNodeId, endNodeId, "next"),
      from: voicemailNodeId,
      to: endNodeId,
      fromHandle: "next",
      label: "",
    },
  ];
}

function insertNodeIntoEdge(
  edges: FlowEdge[],
  fromNodeId: string,
  insertedNode: FlowNode,
  fromHandle: string,
  label: string,
) {
  const existing = edges.find(
    (edge) => edge.from === fromNodeId && edge.fromHandle === fromHandle,
  );
  const withoutExisting = edges.filter(
    (edge) => !(edge.from === fromNodeId && edge.fromHandle === fromHandle),
  );
  const nextEdges = [
    ...withoutExisting,
    {
      id: edgeId(fromNodeId, insertedNode.id, fromHandle),
      from: fromNodeId,
      to: insertedNode.id,
      fromHandle,
      label,
    },
  ];

  if (existing) {
    const nextHandle = defaultOutgoingHandle(insertedNode);
    nextEdges.push({
      id: edgeId(insertedNode.id, existing.to, nextHandle.handle),
      from: insertedNode.id,
      to: existing.to,
      fromHandle: nextHandle.handle,
      label: nextHandle.label,
    });
  }

  return nextEdges;
}

function createFlowNode(
  item: PaletteItem,
  position: CanvasPosition,
  ruleId: string | null,
): FlowNode {
  const id = ruleId
    ? `${item.type === "IF_ELSE" ? "rule" : "queue"}:${ruleId}`
    : `${item.type.toLowerCase()}:${Date.now()}`;
  const defaults: Record<string, unknown> = {
    label: item.label,
  };

  if (item.type === "ROUTE_TO") defaults.routeTarget = "TEAM";
  if (item.type === "IF_ELSE" || item.type === "RULE") {
    defaults.conditionOperator = "EXISTS";
    defaults.conditionType = "KNOWN_CONTACT";
  }
  if (item.type === "WAIT") defaults.seconds = 10;
  if (item.type === "AUDIO_MESSAGE")
    defaults.message = "Please hold while we route your call.";
  if (item.type === "IVR_MENU") {
    defaults.prompt = "Press 1 for sales, 2 for support, or stay on the line.";
    defaults.promptType = "TEXT_TO_SPEECH";
    defaults.voice = "alice";
    defaults.language = "en-GB";
    defaults.retryCount = 1;
    defaults.retryMessage = "That option was not recognised. Please try again.";
    defaults.ivrOptions = [
      {
        key: "1",
        label: "Sales",
        message: "Connecting you to Sales.",
        destination: "",
      },
      {
        key: "2",
        label: "Support",
        message: "Connecting you to Support.",
        destination: "",
      },
    ];
    defaults.ivrKeys = ["1", "2"];
  }
  if (item.type === "REDIRECT") defaults.destination = "";
  if (ruleId) defaults.ruleId = ruleId;

  return {
    id,
    type: item.type,
    x: position.x,
    y: position.y,
    data: defaults,
  };
}

function createRoutingRule(
  id: string,
  item: PaletteItem,
  queues: Queue[],
  currentCount: number,
): RoutingRule {
  const queueId = queues[0]?.id ?? "sales";

  return {
    id,
    name: item.label,
    enabled: true,
    priority: currentCount + 1,
    condition:
      item.type === "IF_ELSE"
        ? "Describe when this route should match"
        : "Custom call route",
    queueId,
    ringStrategy: "QUEUE_DEFAULT",
    timeoutSeconds: 25,
    fallbackDestination: "VOICEMAIL",
    fallbackQueueId: null,
  };
}

function defaultOutgoingHandle(node: FlowNode) {
  return isRoutingActionNode(node)
    ? { handle: "no_answer", label: "no answer" }
    : { handle: "next", label: "next" };
}

function getNewNodePosition(nodes: FlowNode[], fromNode?: FlowNode | null) {
  if (fromNode) {
    return {
      x: clamp(fromNode.x + 380, 60, canvasWidth - nodeWidth - 60),
      y: clamp(fromNode.y + 150, 80, canvasHeight - nodeHeight - 80),
    };
  }

  return {
    x: 760,
    y: 340 + nodes.length * 38,
  };
}

function getFlowIssues(nodes: FlowNode[], edges: FlowEdge[]) {
  const issues: string[] = [];
  const nodeIds = new Set(nodes.map((node) => node.id));

  for (const node of nodes) {
    const content = nodeContent(node, null, []);
    if (!String(node.data?.label ?? content.title).trim()) {
      issues.push(`${content.title}: Add a node label.`);
    }

    if (isConditionNode(node)) {
      if (
        (node.type === "IF_ELSE" || node.type === "RULE") &&
        conditionRequiresValue(conditionTypeForNode(node)) &&
        !String(node.data?.conditionValue ?? "").trim()
      ) {
        issues.push(`${content.title}: Add the condition match value.`);
      }

      if (
        !edges.some(
          (edge) => edge.from === node.id && edge.fromHandle === "yes",
        )
      ) {
        issues.push(`${content.title}: Connect the Yes path.`);
      }
      if (
        !edges.some((edge) => edge.from === node.id && edge.fromHandle === "no")
      ) {
        issues.push(`${content.title}: Connect the No path.`);
      }
    } else if (isRoutingActionNode(node)) {
      if (
        node.type === "ROUTE_TO" &&
        routeTargetForNode(node) === "INDIVIDUAL" &&
        !String(node.data?.userId ?? "").trim()
      ) {
        issues.push(`${content.title}: Choose an individual.`);
      }
      if (
        !edges.some(
          (edge) => edge.from === node.id && edge.fromHandle === "no_answer",
        )
      ) {
        issues.push(`${content.title}: Connect the no-answer path.`);
      }
    } else if (node.type === "IVR_MENU") {
      const options = ivrMenuOptionsForNode(node);
      if (!String(node.data?.prompt ?? "").trim()) {
        issues.push(`${content.title}: Add the caller prompt.`);
      }
      if (!options.length) {
        issues.push(`${content.title}: Add at least one keypad option.`);
      }
      for (const option of options) {
        if (
          !edges.some(
            (edge) =>
              edge.from === node.id &&
              edge.fromHandle === `digit:${option.key}`,
          )
        ) {
          issues.push(`${content.title}: Connect key ${option.key}.`);
        }
      }
    }

    if (!isTerminalNode(node) && !edges.some((edge) => edge.from === node.id)) {
      issues.push(`${content.title}: Connect the next step.`);
    }
  }

  for (const edge of edges) {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
      issues.push("Flow contains a connection to a missing node.");
    }
  }

  return issues;
}

function nodeContent(
  node: FlowNode,
  rule: RoutingRule | null,
  queues: Queue[],
) {
  const customLabel =
    typeof node.data?.label === "string" ? node.data.label : "";
  const base = paletteContent(node.type);

  if (node.type === "INBOUND_CALL" || node.type === "START") {
    return {
      ...base,
      kind: "Start",
      title: customLabel || "Inbound call",
      detail: "Customer reaches a business or tracking number.",
    };
  }

  if (node.type === "CONTACT_IN_OPEN_SALE" || node.id === openSaleNodeId) {
    return {
      ...base,
      kind: "If / else",
      title: customLabel || "Contact in open sale?",
      detail: "If the caller matches an open sale, try the sale owner first.",
    };
  }

  if (node.type === "ROUTE_TO" || node.type === "ROUTE_TO_SALE_AGENT") {
    const routeTarget =
      node.type === "ROUTE_TO_SALE_AGENT"
        ? "SALE_AGENT"
        : routeTargetForNode(node);
    const routeTitle =
      routeTarget === "SALE_AGENT"
        ? "Route to sale agent"
        : routeTarget === "INDIVIDUAL"
          ? "Route to individual"
          : "Route to team";
    const routeDetail =
      routeTarget === "SALE_AGENT"
        ? "Ring the owner of the open sale before trying the wider team."
        : routeTarget === "INDIVIDUAL"
          ? "Ring a chosen person before following the no-answer path."
          : `${formatSystemValue(rule?.ringStrategy ?? "QUEUE_DEFAULT")} / ${
              rule?.timeoutSeconds ?? 25
            }s timeout`;

    return {
      ...base,
      kind: "Route to",
      title: customLabel || routeTitle,
      detail: routeDetail,
    };
  }

  if (node.type === "RING_TEAM" || node.type === "QUEUE") {
    return {
      ...base,
      kind: "Ring to",
      title: customLabel || queueName(queues, rule?.queueId),
      detail: `${formatSystemValue(rule?.ringStrategy ?? "QUEUE_DEFAULT")} / ${
        rule?.timeoutSeconds ?? 25
      }s timeout`,
    };
  }

  if (node.type === "WAIT") {
    return {
      ...base,
      kind: "Wait",
      title: customLabel || `Wait ${Number(node.data?.seconds ?? 10)}s`,
      detail: "Pause before moving to the next routing step.",
    };
  }

  if (node.type === "VOICEMAIL" || node.type === "FALLBACK") {
    return {
      ...base,
      kind: "Voicemail",
      title: customLabel || "Voicemail",
      detail: "Record a message when all eligible agents have been tried.",
    };
  }

  if (node.type === "REDIRECT") {
    return {
      ...base,
      kind: "Redirect",
      title: customLabel || "Redirect",
      detail: "Forward the caller to another destination.",
    };
  }

  if (node.type === "BUSINESS_HOURS") {
    return {
      ...base,
      kind: "If / else",
      title: customLabel || "Business hours",
      detail: "Branch based on whether the team is currently open.",
    };
  }

  if (node.type === "DATE_RULE") {
    return {
      ...base,
      kind: "If / else",
      title: customLabel || "Date rule",
      detail: "Branch based on a date, holiday or calendar rule.",
    };
  }

  if (node.type === "TIME_RULE") {
    return {
      ...base,
      kind: "If / else",
      title: customLabel || "Time rule",
      detail: "Branch based on the time of day.",
    };
  }

  if (node.type === "AUDIO_MESSAGE") {
    return {
      ...base,
      kind: "Audio",
      title: customLabel || "Audio message",
      detail: "Play a message before continuing to the next routing step.",
    };
  }

  if (node.type === "IVR_MENU") {
    return {
      ...base,
      kind: "IVR",
      title: customLabel || "IVR menu",
      detail: "Prompt callers to press a key and choose a route.",
    };
  }

  if (node.type === "IF_ELSE" || node.type === "RULE") {
    return {
      ...base,
      kind: "If / else",
      title: customLabel || rule?.name || "If / else",
      detail: `Branch on ${routingConditionLabel(conditionTypeForNode(node)).toLowerCase()}.`,
    };
  }

  if (node.type === "END_CALL" || node.type === "NO_MATCH") {
    return {
      ...base,
      kind: "End",
      title: customLabel || "End call",
      detail: "The call journey is complete.",
    };
  }

  return {
    ...base,
    kind: "If / else",
    title: customLabel || rule?.name || "Routing rule",
    detail: rule?.condition || "Branch the call based on a rule.",
  };
}

function paletteContent(type: FlowNodeType) {
  if (
    type === "IF_ELSE" ||
    type === "CONTACT_IN_OPEN_SALE" ||
    type === "BUSINESS_HOURS" ||
    type === "DATE_RULE" ||
    type === "TIME_RULE" ||
    type === "RULE"
  ) {
    return {
      icon: "⌁",
      header: "bg-sky-100 text-sky-900",
      border: "border-sky-200",
      iconTone: "bg-sky-50 text-sky-700",
      inspector:
        "border-sky-100 bg-sky-50 dark:border-sky-900/40 dark:bg-sky-950/20",
    };
  }

  if (type === "WAIT") {
    return {
      icon: "◷",
      header: "bg-indigo-100 text-indigo-900",
      border: "border-indigo-200",
      iconTone: "bg-indigo-50 text-indigo-700",
      inspector:
        "border-indigo-100 bg-indigo-50 dark:border-indigo-900/40 dark:bg-indigo-950/20",
    };
  }

  if (type === "AUDIO_MESSAGE" || type === "IVR_MENU") {
    return {
      icon: type === "IVR_MENU" ? "⑴" : "▶",
      header: "bg-violet-100 text-violet-900",
      border: "border-violet-200",
      iconTone: "bg-violet-50 text-violet-700",
      inspector:
        "border-violet-100 bg-violet-50 dark:border-violet-900/40 dark:bg-violet-950/20",
    };
  }

  if (type === "VOICEMAIL" || type === "FALLBACK") {
    return {
      icon: "◎",
      header: "bg-amber-100 text-amber-900",
      border: "border-amber-200",
      iconTone: "bg-amber-50 text-amber-700",
      inspector:
        "border-amber-100 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/20",
    };
  }

  if (type === "END_CALL" || type === "NO_MATCH") {
    return {
      icon: "■",
      header: "bg-gray-100 text-gray-800",
      border: "border-gray-300",
      iconTone: "bg-gray-50 text-gray-700",
      inspector:
        "border-gray-100 bg-gray-50 dark:border-gray-800 dark:bg-gray-950",
    };
  }

  return {
    icon: "☎",
    header: "bg-emerald-100 text-emerald-900",
    border: "border-emerald-200",
    iconTone: "bg-emerald-50 text-emerald-700",
    inspector:
      "border-emerald-100 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-950/20",
  };
}

function ruleForNode(rules: RoutingRule[], node: FlowNode) {
  const dataRuleId =
    typeof node.data?.ruleId === "string" ? node.data.ruleId : null;
  if (dataRuleId) return rules.find((rule) => rule.id === dataRuleId) ?? null;

  if (
    node.id === openSaleNodeId ||
    node.id === saleAgentNodeId ||
    node.id === ownerWaitNodeId
  ) {
    return ownerFirstRule(rules);
  }

  if (
    node.id === salesTeamNodeId ||
    node.id === voicemailNodeId ||
    node.id === endNodeId
  ) {
    return salesTeamRule(rules);
  }

  const id = nodeRuleId(node.id);
  return id ? (rules.find((rule) => rule.id === id) ?? null) : null;
}

function ownerFirstRule(rules: RoutingRule[]) {
  return (
    rules.find((rule) => rule.id === "known-contacts") ??
    rules.find((rule) =>
      /contact|sale|owner/i.test(`${rule.name} ${rule.condition}`),
    ) ??
    salesTeamRule(rules)
  );
}

function salesTeamRule(rules: RoutingRule[]) {
  return (
    rules.find((rule) => rule.id === "general-inbound") ??
    rules.find((rule) => rule.queueId === "sales") ??
    rules[0] ??
    null
  );
}

function nodeRuleId(nodeId: string) {
  const [, ruleId] = nodeId.split(":");
  return ruleId || null;
}

function nodeDimensions(node: FlowNode) {
  if (node.type === "END_CALL" || node.type === "NO_MATCH") {
    return { width: endNodeWidth, height: endNodeHeight };
  }

  if (isConditionNode(node)) return { width: nodeWidth, height: 156 };
  if (node.type === "IVR_MENU") return { width: nodeWidth, height: 150 };
  if (node.type === "ROUTE_TO" || node.type === "ROUTE_TO_SALE_AGENT") {
    return { width: nodeWidth, height: 134 };
  }
  return { width: nodeWidth, height: nodeHeight };
}

function getEdgeSourcePoint(node: FlowNode, handle: string) {
  const dimensions = nodeDimensions(node);
  const width = dimensions.width;
  const height = dimensions.height;
  const bottom = node.y + height;

  if (node.type === "IVR_MENU" && handle.startsWith("digit:")) {
    const keys = ivrKeysForNode(node);
    const handleIndex = keys.findIndex((key) => handle === `digit:${key}`);
    if (handleIndex >= 0) {
      const spacing = Math.min(62, width / (keys.length + 1));
      return {
        x: node.x + width / 2 + (handleIndex - (keys.length - 1) / 2) * spacing,
        y: bottom + branchHandleOffsetY,
      };
    }
  }

  if (isConditionNode(node) && handle === "yes") {
    return { x: node.x + width / 2 - 58, y: bottom + branchHandleOffsetY };
  }

  if (isConditionNode(node) && handle === "no") {
    return { x: node.x + width / 2 + 58, y: bottom + branchHandleOffsetY };
  }

  return { x: node.x + width / 2, y: bottom + normalHandleOffsetY };
}

function ivrKeysForNode(node: FlowNode) {
  return ivrMenuOptionsForNode(node).map((option) => option.key);
}

function ivrMenuOptionsForNode(node: FlowNode): IvrMenuOption[] {
  const rawOptions = Array.isArray(node.data?.ivrOptions)
    ? node.data.ivrOptions
    : [];
  const normalized = normalizeIvrMenuOptions(
    rawOptions.map((option) => {
      const record =
        option && typeof option === "object"
          ? (option as Record<string, unknown>)
          : {};

      return {
        key: String(record.key ?? ""),
        label: String(record.label ?? ""),
        message: String(record.message ?? ""),
        destination: String(record.destination ?? ""),
      };
    }),
  );

  if (normalized.length) return normalized;

  const rawKeys = Array.isArray(node.data?.ivrKeys)
    ? node.data.ivrKeys
    : ["1", "2"];

  return normalizeIvrMenuOptions(
    rawKeys.map((key) => ({
      key: String(key),
      label: "",
      message: "",
      destination: "",
    })),
  );
}

function normalizeIvrMenuOptions(options: IvrMenuOption[]) {
  const usedKeys = new Set<string>();
  const normalized: IvrMenuOption[] = [];

  for (const option of options) {
    const key = sanitizeIvrKey(option.key);
    if (!key || usedKeys.has(key)) continue;
    usedKeys.add(key);
    normalized.push({
      key,
      label: option.label.trim().slice(0, 60),
      message: option.message.trim().slice(0, 240),
      destination: option.destination.trim(),
    });
    if (normalized.length >= ivrOptionLimit) break;
  }

  return normalized;
}

function sanitizeIvrKey(value: string) {
  const key = value.trim().slice(0, 1);
  return ivrKeyPattern.test(key) ? key : "";
}

function ivrPromptPreview(options: IvrMenuOption[]) {
  const labelledOptions = options.filter((option) => option.label.trim());

  if (!labelledOptions.length) {
    return "Add key labels to generate the spoken menu.";
  }

  return `${labelledOptions
    .map((option) => `Press ${option.key} for ${option.label.trim()}`)
    .join(", ")}.`;
}

function updateIvrOption(
  options: IvrMenuOption[],
  index: number,
  patch: Partial<IvrMenuOption>,
) {
  return options.map((option, current) =>
    current === index ? { ...option, ...patch } : option,
  );
}

function getEdgeTargetPoint(node: FlowNode, source?: CanvasPosition) {
  const dimensions = nodeDimensions(node);
  const centerX = node.x + dimensions.width / 2;
  const approachOffset =
    source && Math.abs(source.x - centerX) > 40
      ? (source.x < centerX ? -1 : 1) * Math.min(58, dimensions.width * 0.22)
      : 0;

  return { x: centerX + approachOffset, y: node.y + targetHandleOffsetY };
}

function isConditionNode(node: FlowNode) {
  return (
    node.type === "IF_ELSE" ||
    node.type === "CONTACT_IN_OPEN_SALE" ||
    node.type === "BUSINESS_HOURS" ||
    node.type === "DATE_RULE" ||
    node.type === "TIME_RULE" ||
    node.type === "RULE"
  );
}

function isTerminalNode(node: FlowNode) {
  return node.type === "END_CALL" || node.type === "NO_MATCH";
}

function isRoutingActionNode(node: FlowNode) {
  return (
    node.type === "ROUTE_TO" ||
    node.type === "ROUTE_TO_SALE_AGENT" ||
    node.type === "RING_TEAM" ||
    node.type === "QUEUE"
  );
}

function routeTargetForNode(node: FlowNode) {
  const value = node.data?.routeTarget;

  return value === "SALE_AGENT" || value === "INDIVIDUAL" || value === "TEAM"
    ? value
    : "TEAM";
}

function conditionTypeForNode(node: FlowNode): RoutingConditionType {
  const value = node.data?.conditionType;

  return routingConditionOptions.some((option) => option.type === value)
    ? (value as RoutingConditionType)
    : node.type === "CONTACT_IN_OPEN_SALE"
      ? "OPEN_SALE"
      : "KNOWN_CONTACT";
}

function conditionOperatorForNode(node: FlowNode): RoutingConditionOperator {
  const value = node.data?.conditionOperator;

  return value === "EXISTS" ||
    value === "EQUALS" ||
    value === "CONTAINS" ||
    value === "STARTS_WITH" ||
    value === "ENDS_WITH"
    ? value
    : "CONTAINS";
}

function conditionRequiresValue(type: RoutingConditionType) {
  return Boolean(
    routingConditionOptions.find((option) => option.type === type)
      ?.requiresValue,
  );
}

function evaluateSimulatorCondition(node: FlowNode, context: SimulatorContext) {
  if (node.type === "CONTACT_IN_OPEN_SALE") return context.openSale;
  if (node.type === "BUSINESS_HOURS") return context.businessOpen;
  if (node.type === "TIME_RULE") return context.businessOpen;
  if (node.type === "DATE_RULE") return context.businessOpen;

  return evaluateRoutingCondition(
    {
      operator: conditionOperatorForNode(node),
      type: conditionTypeForNode(node),
      value: String(node.data?.conditionValue ?? ""),
    },
    {
      attribution: context.attribution
        ? {
            campaign: context.source || "simulated-campaign",
            source: context.source || "simulated-source",
          }
        : null,
      contactId: context.contact ? "simulated-contact" : null,
      opportunityId: context.openSale ? "simulated-open-lead" : null,
      opportunitySource: context.source || null,
      source: context.source || null,
      toNumber: context.inboundNumber || null,
      trackingPhoneNumber: context.trackingNumber
        ? context.inboundNumber || "simulated-tracking-number"
        : null,
    },
  );
}

function nextNodeForHandles(
  nodesById: Map<string, FlowNode>,
  edges: FlowEdge[],
  nodeId: string,
  handles: string[],
) {
  const edge = handles
    .map((handle) =>
      edges.find(
        (candidate) =>
          candidate.from === nodeId && candidate.fromHandle === handle,
      ),
    )
    .find(Boolean);

  return edge ? (nodesById.get(edge.to) ?? null) : null;
}

function simulateRoutingPath(
  nodes: FlowNode[],
  edges: FlowEdge[],
  context: SimulatorContext,
) {
  const path: Array<{ branch?: string; id: string; label: string }> = [];
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  let current =
    nodes.find((node) => node.type === "INBOUND_CALL") ??
    nodes.find((node) => node.type === "START") ??
    null;
  const visited = new Set<string>();
  const maxSteps = Math.max(nodes.length * 2, 12);

  while (current && !visited.has(current.id) && path.length < maxSteps) {
    visited.add(current.id);

    if (isConditionNode(current)) {
      const matched = evaluateSimulatorCondition(current, context);
      path.push({
        branch: matched ? "yes" : "no",
        id: current.id,
        label: nodeContent(current, null, []).title,
      });
      current = nextNodeForHandles(nodesById, edges, current.id, [
        matched ? "yes" : "no",
      ]);
      continue;
    }

    if (current.type === "IVR_MENU") {
      const selectedKey = ivrMenuOptionsForNode(current).find(
        (option) =>
          option.key === context.ivrKey &&
          edgeTarget(edges, current?.id ?? "", `digit:${option.key}`),
      )?.key;
      path.push({
        branch: selectedKey ? `key ${selectedKey}` : "timeout",
        id: current.id,
        label: nodeContent(current, null, []).title,
      });
      current = nextNodeForHandles(nodesById, edges, current.id, [
        ...(selectedKey ? [`digit:${selectedKey}`] : []),
        "timeout",
        "next",
      ]);
      continue;
    }

    if (isRoutingActionNode(current)) {
      path.push({
        branch: "no answer",
        id: current.id,
        label: nodeContent(current, null, []).title,
      });
      current = nextNodeForHandles(nodesById, edges, current.id, [
        "no_answer",
        "next",
      ]);
      continue;
    }

    path.push({
      id: current.id,
      label: nodeContent(current, null, []).title,
    });

    if (isTerminalNode(current)) break;

    current = nextNodeForHandles(nodesById, edges, current.id, [
      "next",
      "no_answer",
      "timeout",
    ]);
  }

  return path;
}

function edgeTarget(edges: FlowEdge[], nodeId: string, handle: string) {
  return (
    edges.find((edge) => edge.from === nodeId && edge.fromHandle === handle)
      ?.to ?? ""
  );
}

function edgeId(from: string, to: string, handle: string) {
  return `${from}:${handle}:${to}`;
}

function queueName(queues: Queue[], queueId?: string | null) {
  return queues.find((queue) => queue.id === queueId)?.name ?? "No team";
}

function uniqueRuleId(base: string, existingIds: string[]) {
  let candidate = base || "routing-rule";
  let counter = 2;

  while (existingIds.includes(candidate)) {
    candidate = `${base}-${counter}`;
    counter += 1;
  }

  return candidate;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function formatSystemValue(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function isEditorControl(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;

  if (target.closest("[data-routing-node-card]")) {
    return Boolean(target.closest("[data-canvas-control]"));
  }

  return Boolean(
    target.closest(
      "button,input,select,textarea,a,[data-step-palette],[data-canvas-control]",
    ),
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

const inputClassName =
  "h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";

const textareaClassName =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";
