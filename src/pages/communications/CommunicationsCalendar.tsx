import { useState } from "react";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  isSameMonth,
  isToday,
  addMonths,
  subMonths,
} from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function CommunicationsCalendar() {
  const [month, setMonth] = useState(() => new Date());

  const gridStart = startOfWeek(startOfMonth(month));
  const gridEnd = endOfWeek(endOfMonth(month));
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title flex items-center gap-2">
          <CalendarDays className="h-6 w-6 text-primary" /> Calendar
        </h1>
        <p className="page-subtitle">Part of the Communications Center</p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">{format(month, "MMMM yyyy")}</CardTitle>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" onClick={() => setMonth((m) => subMonths(m, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={() => setMonth((m) => addMonths(m, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 text-center text-xs font-medium text-muted-foreground mb-2">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d} className="py-1">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {days.map((day) => (
              <div
                key={day.toISOString()}
                className={`min-h-16 rounded-md border p-1.5 text-xs ${
                  isSameMonth(day, month) ? "bg-card" : "bg-muted/30 text-muted-foreground"
                } ${isToday(day) ? "border-primary" : "border-border"}`}
              >
                {format(day, "d")}
              </div>
            ))}
          </div>
          <p className="mt-4 text-sm text-muted-foreground text-center">
            No scheduled communications this month.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
