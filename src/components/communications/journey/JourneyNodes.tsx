import { createContext, useContext } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Clock, GitFork, MessageCircle, Square, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { DECISION_LABELS, type JourneyNodeData } from "@/lib/comms/journeyGraph";

// Entry reads the audience from the journey row, so the canvas passes it down through context.
export const JourneyCanvasContext = createContext<{ audienceText: string }>({ audienceText: "—" });

function Shell({
  selected,
  tone,
  icon: Icon,
  title,
  children,
}: {
  selected?: boolean;
  tone: string;
  icon: typeof Users;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("w-56 rounded-lg border bg-card p-3 shadow-sm", selected && "ring-2 ring-primary")}>
      <div className="flex items-center gap-2">
        <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-md", tone)}><Icon className="h-4 w-4" /></span>
        <p className="truncate text-sm font-medium">{title}</p>
      </div>
      {children && <div className="mt-2 text-xs text-muted-foreground">{children}</div>}
    </div>
  );
}

const handleCls = "!h-2.5 !w-2.5 !bg-primary";

export function EntryNode({ data, selected }: NodeProps) {
  const { audienceText } = useContext(JourneyCanvasContext);
  const d = data as JourneyNodeData;
  return (
    <>
      <Shell selected={selected} tone="bg-primary/10 text-primary" icon={Users} title={d.label || "Audience"}>
        <p className="line-clamp-2">{audienceText}</p>
      </Shell>
      <Handle type="source" position={Position.Bottom} className={handleCls} />
    </>
  );
}

export function MessageNode({ data, selected }: NodeProps) {
  const d = data as JourneyNodeData;
  return (
    <>
      <Handle type="target" position={Position.Top} className={handleCls} />
      <Shell selected={selected} tone="bg-success/10 text-success" icon={MessageCircle} title={d.label || "WhatsApp message"}>
        {d.template_id ? (
          <>
            <p className="truncate font-medium text-foreground">{d.template_name}</p>
            <p className="line-clamp-2">{d.template_body}</p>
          </>
        ) : (
          <p className="text-destructive">Choose a template</p>
        )}
      </Shell>
      <Handle type="source" position={Position.Bottom} className={handleCls} />
    </>
  );
}

export function DelayNode({ data, selected }: NodeProps) {
  const d = data as JourneyNodeData;
  return (
    <>
      <Handle type="target" position={Position.Top} className={handleCls} />
      <Shell selected={selected} tone="bg-warning/10 text-warning" icon={Clock} title={d.label || "Wait"}>
        {d.duration ? `${d.duration} ${d.unit ?? "hours"}` : <span className="text-destructive">Set a duration</span>}
      </Shell>
      <Handle type="source" position={Position.Bottom} className={handleCls} />
    </>
  );
}

export function DecisionNode({ data, selected }: NodeProps) {
  const d = data as JourneyNodeData;
  return (
    <>
      <Handle type="target" position={Position.Top} className={handleCls} />
      <Shell selected={selected} tone="bg-info/10 text-info" icon={GitFork} title={d.label || "Decision"}>
        {d.condition ? DECISION_LABELS[d.condition] : <span className="text-destructive">Choose a condition</span>}
        <div className="mt-2 flex justify-between px-4 text-[10px] font-medium">
          <span className="text-success">Yes</span>
          <span className="text-destructive">No</span>
        </div>
      </Shell>
      <Handle id="yes" type="source" position={Position.Bottom} style={{ left: "25%" }} className={handleCls} />
      <Handle id="no" type="source" position={Position.Bottom} style={{ left: "75%" }} className={handleCls} />
    </>
  );
}

export function ExitNode({ selected }: NodeProps) {
  return (
    <>
      <Handle type="target" position={Position.Top} className={handleCls} />
      <Shell selected={selected} tone="bg-muted text-muted-foreground" icon={Square} title="Exit" />
    </>
  );
}

export const nodeTypes = {
  entry: EntryNode,
  message: MessageNode,
  delay: DelayNode,
  decision: DecisionNode,
  exit: ExitNode,
};
