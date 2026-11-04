import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addEdge,
  Background,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesInitialized,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ArrowLeft, Calendar, Clock, GitFork, Loader2, MessageCircle, Pause, Pencil, Play, Save, Send, Square } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ActivateJourneyDialog } from "@/components/communications/journey/ActivateJourneyDialog";
import { JourneyDetailsDialog } from "@/components/communications/journey/JourneyDetailsDialog";
import { JourneyScheduleDialog } from "@/components/communications/journey/JourneyScheduleDialog";
import { JourneyCanvasContext, nodeTypes } from "@/components/communications/journey/JourneyNodes";
import { NodePropertyPanel, type ApprovedTemplate } from "@/components/communications/journey/NodePropertyPanel";
import { SubmitApprovalDialog } from "@/components/communications/journey/SubmitApprovalDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  parseCanvas,
  validateCanvas,
  type CanvasData,
  type JourneyNode,
  type JourneyNodeData,
  type JourneyNodeType,
} from "@/lib/comms/journeyGraph";
import { onlyClinicTemplates } from "@/lib/comms/templateFilter";
import {
  approvalBadgeClass,
  approvalLabel,
  audienceSummary,
  invokeJourneyActions,
  JOURNEY_SELECT,
  normalizeJourney,
  statusColors,
  type Journey,
} from "@/lib/comms/journeys";

type RFNode = Node<JourneyNodeData>;

const toRF = (c: CanvasData): { nodes: RFNode[]; edges: Edge[] } => ({
  nodes: c.nodes.map((n) => ({ id: n.id, type: n.type, position: n.position, data: n.data, deletable: n.type !== "entry" })),
  edges: c.edges.map((e) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle ?? undefined, label: e.sourceHandle === "yes" ? "Yes" : e.sourceHandle === "no" ? "No" : undefined })),
});

const fromRF = (nodes: RFNode[], edges: Edge[]): CanvasData => ({
  nodes: nodes.map((n) => ({ id: n.id, type: n.type as JourneyNodeType, position: n.position, data: n.data })),
  edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle ?? null })),
});

const ADDABLE: { type: Exclude<JourneyNodeType, "entry">; label: string; icon: typeof Clock }[] = [
  { type: "message", label: "WhatsApp message", icon: MessageCircle },
  { type: "delay", label: "Wait", icon: Clock },
  { type: "decision", label: "Decision", icon: GitFork },
  { type: "exit", label: "Exit", icon: Square },
];

function Canvas({ journey }: { journey: Journey }) {
  const qc = useQueryClient();
  const initial = useMemo(() => toRF(parseCanvas(journey.canvas_data)), [journey.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [nodes, setNodes, onNodesChange] = useNodesState<RFNode>(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initial.edges);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [showSubmit, setShowSubmit] = useState(false);
  const [showActivate, setShowActivate] = useState(false);

  // Frame the steps once when the journey opens, then back off 25% from fitView's zoom.
  const { fitView, getZoom, zoomTo } = useReactFlow();
  const nodesInitialized = useNodesInitialized();
  const framed = useRef(false);
  useEffect(() => {
    if (!nodesInitialized || framed.current) return;
    framed.current = true;
    fitView({ duration: 0 }).then(() => zoomTo(getZoom() * 0.75, { duration: 0 }));
  }, [nodesInitialized, fitView, getZoom, zoomTo]);

  const locked = journey.status === "active" || journey.approval_status === "pending";

  const { data: templates = [] } = useQuery({
    queryKey: ["comms-approved-templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("comms_whatsapp_templates")
        .select("id, name, category, body, variable_map")
        .eq("status", "approved")
        .order("name");
      if (error) throw error;
      // Same rule as the Templates page: a template the clinic cannot see there must not be
      // pickable here either, or the two screens disagree about what exists.
      return onlyClinicTemplates((data || []) as unknown as ApprovedTemplate[]);
    },
  });

  useEffect(() => {
    const fresh = toRF(parseCanvas(journey.canvas_data));
    setNodes(fresh.nodes);
    setEdges(fresh.edges);
    setDirty(false);
  }, [journey.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps

  const canvas = useMemo(() => fromRF(nodes, edges), [nodes, edges]);
  const problems = useMemo(() => validateCanvas(canvas), [canvas]);
  const selected = canvas.nodes.find((n) => n.id === selectedId) as JourneyNode | undefined;

  const touch = () => setDirty(true);

  const onConnect = useCallback(
    (c: Connection) => {
      setEdges((eds) =>
        addEdge({ ...c, id: `e_${c.source}_${c.sourceHandle ?? "out"}_${c.target}`, label: c.sourceHandle === "yes" ? "Yes" : c.sourceHandle === "no" ? "No" : undefined }, eds.filter((e) => !(e.source === c.source && (e.sourceHandle ?? null) === (c.sourceHandle ?? null))))
      );
      setDirty(true);
    },
    [setEdges]
  );

  const addNode = (type: Exclude<JourneyNodeType, "entry">) => {
    const last = nodes[nodes.length - 1];
    const id = `${type}_${Date.now().toString(36)}`;
    const data: JourneyNodeData = type === "delay" ? { duration: 1, unit: "days" } : {};
    setNodes((ns) => [...ns, { id, type, position: { x: last ? last.position.x : 0, y: last ? last.position.y + 150 : 0 }, data }]);
    setSelectedId(id);
    touch();
  };

  const patchSelected = (patch: Partial<JourneyNodeData>) => {
    setNodes((ns) => ns.map((n) => (n.id === selectedId ? { ...n, data: { ...n.data, ...patch } } : n)));
    touch();
  };

  const deleteSelected = () => {
    setNodes((ns) => ns.filter((n) => n.id !== selectedId));
    setEdges((es) => es.filter((e) => e.source !== selectedId && e.target !== selectedId));
    setSelectedId(null);
    touch();
  };

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("comms_journeys").update({ canvas_data: canvas } as never).eq("id", journey.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(journey.approval_status === "approved" ? "Saved — this journey needs approval again" : "Journey saved");
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["comms-journey", journey.id] });
      qc.invalidateQueries({ queryKey: ["comms-journeys"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setStatus = useMutation({
    mutationFn: (action: "pause" | "resume") => invokeJourneyActions({ action, journey_id: journey.id }),
    onSuccess: (_r, action) => {
      toast.success(action === "pause" ? "Journey paused" : "Journey resumed");
      qc.invalidateQueries({ queryKey: ["comms-journey", journey.id] });
      qc.invalidateQueries({ queryKey: ["comms-journeys"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const a = journey.approval_status;
  const canSubmit = journey.status === "draft" && (a === "draft" || a === "rejected");

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <Link to="/communications/journeys" className="mb-1 inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="mr-1 h-4 w-4" /> Journeys
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-bold md:text-2xl">{journey.name}</h1>
            <Badge className={cn(statusColors[journey.status])}>{journey.status}</Badge>
            {a !== "draft" && <Badge className={approvalBadgeClass[a]}>{approvalLabel[a]}</Badge>}
          </div>
          {journey.description && <p className="text-sm text-muted-foreground">{journey.description}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setShowEdit(true)}><Pencil className="mr-2 h-4 w-4" /> Edit</Button>
          <Button variant="outline" onClick={() => setShowSchedule(true)}><Calendar className="mr-2 h-4 w-4" /> Schedule</Button>
          {!locked && (
            <Button variant="outline" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Save
            </Button>
          )}
          {canSubmit && (
            <Button variant="outline" disabled={dirty} title={dirty ? "Save your changes first" : undefined} onClick={() => setShowSubmit(true)}>
              <Send className="mr-2 h-4 w-4" /> Submit for Approval
            </Button>
          )}
          {journey.status === "draft" && (
            <Button disabled={a !== "approved" || dirty} title={a !== "approved" ? "Needs approval before activating" : undefined} onClick={() => setShowActivate(true)}>
              <Play className="mr-2 h-4 w-4" /> Activate
            </Button>
          )}
          {journey.status === "active" && (
            <Button variant="outline" onClick={() => setStatus.mutate("pause")}><Pause className="mr-2 h-4 w-4" /> Pause</Button>
          )}
          {journey.status === "paused" && (
            <Button disabled={a !== "approved"} onClick={() => setStatus.mutate("resume")}><Play className="mr-2 h-4 w-4" /> Resume</Button>
          )}
        </div>
      </div>

      {locked && (
        <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
          {journey.status === "active" ? "This journey is active — pause it to edit the steps." : "This journey is awaiting approval and cannot be edited."}
        </p>
      )}
      {a === "rejected" && journey.rejection_reason && (
        <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">Rejected: {journey.rejection_reason}</p>
      )}
      {a === "approved" && !locked && (
        <p className="rounded-md bg-warning/10 p-3 text-sm text-warning">Editing the steps or audience of an approved journey sends it back to Draft for re-approval.</p>
      )}

      <div className="flex flex-col gap-3 lg:flex-row">
        <div className="min-w-0 flex-1 space-y-2">
          {!locked && (
            <div className="flex flex-wrap items-center gap-2">
              {ADDABLE.map(({ type, label, icon: Icon }) => (
                <Button key={type} size="sm" variant="outline" onClick={() => addNode(type)}><Icon className="mr-1.5 h-4 w-4" /> {label}</Button>
              ))}
            </div>
          )}
          <div className="h-[62vh] rounded-lg border bg-card">
            <JourneyCanvasContext.Provider value={{ audienceText: audienceSummary(journey.audience_config), audienceConfig: journey.audience_config }}>
              <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                onNodesChange={(c) => {
                  onNodesChange(c);
                  if (c.some((x) => x.type === "remove" || (x.type === "position" && x.dragging === false))) touch();
                }}
                onEdgesChange={(c) => {
                  onEdgesChange(c);
                  if (c.some((x) => x.type === "remove")) touch();
                }}
                onConnect={onConnect}
                onNodeClick={(_e, n) => setSelectedId(n.id)}
                onPaneClick={() => setSelectedId(null)}
                nodesDraggable={!locked}
                nodesConnectable={!locked}
                edgesReconnectable={false}
                deleteKeyCode={locked ? null : ["Backspace", "Delete"]}
              >
                <Background />
                <Controls showInteractive={false} />
              </ReactFlow>
            </JourneyCanvasContext.Provider>
          </div>
          {problems.length > 0 && (
            <p className="text-xs text-muted-foreground">To submit: {problems.join(" · ")}</p>
          )}
        </div>
        {selected && (
          <NodePropertyPanel node={selected} templates={templates} readOnly={locked} onChange={patchSelected} onDelete={deleteSelected} />
        )}
      </div>

      <JourneyDetailsDialog open={showEdit} onOpenChange={setShowEdit} journey={journey} />
      <JourneyScheduleDialog journey={showSchedule ? journey : null} onOpenChange={(o) => !o && setShowSchedule(false)} />
      <SubmitApprovalDialog journey={showSubmit ? journey : null} onOpenChange={(o) => !o && setShowSubmit(false)} />
      <ActivateJourneyDialog journey={showActivate ? journey : null} onOpenChange={(o) => !o && setShowActivate(false)} />
    </div>
  );
}

export default function JourneyCanvas() {
  const { id } = useParams<{ id: string }>();
  const { data: journey, isLoading, isError } = useQuery({
    queryKey: ["comms-journey", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("comms_journeys").select(JOURNEY_SELECT).eq("id", id!).maybeSingle();
      if (error) throw error;
      return data ? normalizeJourney(data as Record<string, unknown>) : null;
    },
  });

  if (isLoading) return <Skeleton className="h-96 w-full" />;
  if (isError || !journey) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">
        Journey not found. <Link to="/communications/journeys" className="text-primary hover:underline">Back to journeys</Link>
      </div>
    );
  }
  return (
    <ReactFlowProvider>
      <Canvas journey={journey} />
    </ReactFlowProvider>
  );
}
