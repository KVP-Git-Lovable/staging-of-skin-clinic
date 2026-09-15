import { useEffect, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell,
  PieChart, Pie, Legend, LineChart, Line,
} from "recharts";
import { BarChart3, PieChart as PieIcon, CircleDot, LineChart as LineIcon } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

interface ChartDatum {
  label: string;
  value: number;
}

type ChartType = "bar" | "pie" | "doughnut" | "line";

interface Props {
  title: string;
  data: ChartDatum[];
  valueLabel?: string;
  orientation?: "vertical" | "horizontal";
  reportKey?: string;
}

const PALETTE = [
  "hsl(var(--primary))",
  "hsl(var(--chart-2, var(--primary)))",
  "hsl(var(--chart-3, var(--primary)))",
  "hsl(var(--chart-4, var(--primary)))",
  "hsl(var(--chart-5, var(--primary)))",
];

const TOOLTIP_STYLE = { fontSize: 12, background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" };

export function ReportChart({ title, data, valueLabel = "Value", orientation = "vertical", reportKey }: Props) {
  const storageKey = reportKey ? `report-chart-type:${reportKey}` : null;
  const [chartType, setChartType] = useState<ChartType>(() => {
    if (!storageKey) return "bar";
    if (typeof window === "undefined") return "bar";
    const v = window.localStorage.getItem(storageKey) as ChartType | null;
    return v && ["bar", "pie", "doughnut", "line"].includes(v) ? v : "bar";
  });

  useEffect(() => {
    if (storageKey) window.localStorage.setItem(storageKey, chartType);
  }, [storageKey, chartType]);

  const renderChart = () => {
    if (chartType === "pie" || chartType === "doughnut") {
      return (
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="label"
            cx="50%"
            cy="50%"
            outerRadius={90}
            innerRadius={chartType === "doughnut" ? 55 : 0}
            label={(e: any) => `${e.label} (${(e.percent * 100).toFixed(0)}%)`}
            labelLine={false}
          >
            {data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
          </Pie>
          <Tooltip contentStyle={TOOLTIP_STYLE} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
        </PieChart>
      );
    }
    if (chartType === "line") {
      return (
        <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: data.length > 6 ? 56 : 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            interval={0}
            angle={data.length > 6 ? -35 : 0}
            textAnchor={data.length > 6 ? "end" : "middle"}
            height={data.length > 6 ? 60 : 30}
          />
          <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
          <Tooltip contentStyle={TOOLTIP_STYLE} />
          <Line type="monotone" dataKey="value" name={valueLabel} stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      );
    }
    // bar
    if (orientation === "horizontal") {
      return (
        <BarChart data={data} layout="vertical" margin={{ top: 8, right: 16, left: 16, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis type="number" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
          <YAxis type="category" dataKey="label" width={120} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
          <Tooltip contentStyle={TOOLTIP_STYLE} />
          <Bar dataKey="value" name={valueLabel} radius={[0, 4, 4, 0]}>
            {data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
          </Bar>
        </BarChart>
      );
    }
    return (
      <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: data.length > 6 ? 56 : 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          interval={0}
          angle={data.length > 6 ? -35 : 0}
          textAnchor={data.length > 6 ? "end" : "middle"}
          height={data.length > 6 ? 60 : 30}
        />
        <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Bar dataKey="value" name={valueLabel} radius={[4, 4, 0, 0]}>
          {data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
        </Bar>
      </BarChart>
    );
  };

  return (
    <div className="data-table p-4 mb-4">
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{valueLabel}</span>
        </div>
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          value={chartType}
          onValueChange={(v) => v && setChartType(v as ChartType)}
        >
          <ToggleGroupItem value="bar" aria-label="Bar chart" className="h-7 w-7 p-0">
            <BarChart3 className="h-3.5 w-3.5" />
          </ToggleGroupItem>
          <ToggleGroupItem value="line" aria-label="Line chart" className="h-7 w-7 p-0">
            <LineIcon className="h-3.5 w-3.5" />
          </ToggleGroupItem>
          <ToggleGroupItem value="pie" aria-label="Pie chart" className="h-7 w-7 p-0">
            <PieIcon className="h-3.5 w-3.5" />
          </ToggleGroupItem>
          <ToggleGroupItem value="doughnut" aria-label="Doughnut chart" className="h-7 w-7 p-0">
            <CircleDot className="h-3.5 w-3.5" />
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
      {data.length === 0 ? (
        <div className="h-[240px] flex items-center justify-center text-xs text-muted-foreground">
          No data to chart for current filters.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={chartType === "pie" || chartType === "doughnut" ? 300 : 260}>
          {renderChart()}
        </ResponsiveContainer>
      )}
    </div>
  );
}