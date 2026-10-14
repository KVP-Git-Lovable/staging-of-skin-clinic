// Pure canvas helpers shared by the Journey Builder UI and the Deno edge functions.
// No imports on purpose: supabase/functions/_shared/comms-journey-graph.ts is a byte copy of this
// file (a vitest parity test keeps them identical).

export type JourneyNodeType = "entry" | "message" | "delay" | "decision" | "exit";
export type DelayUnit = "minutes" | "hours" | "days";
export type DecisionCondition = "wa_delivered" | "wa_read" | "wa_failed";

export interface JourneyNodeData {
  label?: string;
  // message
  template_id?: string;
  template_name?: string;
  template_category?: string;
  template_body?: string;
  /** "1" -> clinic token name, overriding the template's own variable_map */
  variables?: Record<string, string>;
  // delay
  duration?: number;
  unit?: DelayUnit;
  // decision
  condition?: DecisionCondition;
  [key: string]: unknown;
}

export interface JourneyNode {
  id: string;
  type: JourneyNodeType;
  position: { x: number; y: number };
  data: JourneyNodeData;
}

export interface JourneyEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
}

export interface CanvasData {
  nodes: JourneyNode[];
  edges: JourneyEdge[];
}

export const DELAY_UNIT_MS: Record<DelayUnit, number> = {
  minutes: 60_000,
  hours: 3_600_000,
  days: 86_400_000,
};

export const DECISION_LABELS: Record<DecisionCondition, string> = {
  wa_delivered: "WhatsApp delivered",
  wa_read: "WhatsApp read",
  wa_failed: "WhatsApp failed",
};

export function emptyCanvas(): CanvasData {
  return {
    nodes: [{ id: "entry", type: "entry", position: { x: 0, y: 0 }, data: { label: "Audience" } }],
    edges: [],
  };
}

export function parseCanvas(raw: unknown): CanvasData {
  const c = raw as Partial<CanvasData> | null;
  const nodes = Array.isArray(c?.nodes) ? c!.nodes! : [];
  const edges = Array.isArray(c?.edges) ? c!.edges! : [];
  return nodes.length ? { nodes, edges } : emptyCanvas();
}

export function nodeById(canvas: CanvasData, id: string | null | undefined): JourneyNode | undefined {
  return canvas.nodes.find((n) => n.id === id);
}

export function findEntry(canvas: CanvasData): JourneyNode | undefined {
  return canvas.nodes.find((n) => n.type === "entry");
}

/** Next node along an edge; for decisions pass the "yes" / "no" handle. */
export function nextNodeId(canvas: CanvasData, fromId: string, handle?: string): string | null {
  const edge = canvas.edges.find(
    (e) => e.source === fromId && (handle === undefined || (e.sourceHandle ?? null) === handle),
  );
  return edge?.target ?? null;
}

/** The message node a decision is asking about: nearest upstream message node. */
export function upstreamMessageNode(canvas: CanvasData, nodeId: string): JourneyNode | undefined {
  const seen = new Set<string>();
  let current = nodeId;
  while (!seen.has(current)) {
    seen.add(current);
    const incoming = canvas.edges.find((e) => e.target === current);
    if (!incoming) return undefined;
    const source = nodeById(canvas, incoming.source);
    if (!source) return undefined;
    if (source.type === "message") return source;
    current = source.id;
  }
  return undefined;
}

function hasCycle(canvas: CanvasData): boolean {
  const state = new Map<string, 1 | 2>();
  const visit = (id: string): boolean => {
    if (state.get(id) === 1) return true;
    if (state.get(id) === 2) return false;
    state.set(id, 1);
    for (const e of canvas.edges) if (e.source === id && visit(e.target)) return true;
    state.set(id, 2);
    return false;
  };
  return canvas.nodes.some((n) => visit(n.id));
}

/** Blocking problems; an empty list means the canvas can be submitted for approval. */
export function validateCanvas(canvas: CanvasData): string[] {
  const errors: string[] = [];
  const entry = findEntry(canvas);
  if (!entry) return ["The journey needs an Audience (entry) step"];
  if (!nextNodeId(canvas, entry.id)) errors.push("Connect the Audience step to the first step");

  const messages = canvas.nodes.filter((n) => n.type === "message");
  if (messages.length === 0) errors.push("Add at least one WhatsApp message step");
  for (const m of messages) {
    if (!m.data.template_id) {
      errors.push(`"${m.data.label || "Message"}" has no template selected`);
      continue;
    }
    const needed = Array.from(new Set(Array.from((m.data.template_body ?? "").matchAll(/\{\{(\d+)\}\}/g)).map((x) => x[1])));
    if (needed.some((n) => !m.data.variables?.[n])) errors.push(`"${m.data.label || "Message"}" has template variables with no value chosen`);
  }
  for (const d of canvas.nodes.filter((n) => n.type === "delay")) {
    if (!d.data.duration || d.data.duration <= 0) errors.push(`"${d.data.label || "Delay"}" needs a duration`);
  }
  for (const d of canvas.nodes.filter((n) => n.type === "decision")) {
    if (!d.data.condition) errors.push(`"${d.data.label || "Decision"}" needs a condition`);
    if (!upstreamMessageNode(canvas, d.id)) errors.push(`"${d.data.label || "Decision"}" must follow a message step`);
  }
  if (hasCycle(canvas)) errors.push("The journey contains a loop; steps must flow forward");
  return errors;
}
