import { Link } from "react-router-dom";
import { CalendarCheck, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TeamAttendance } from "@/components/attendance/TeamAttendance";
import { AttendancePolicyTab, HolidaysTab, WeekOffsTab } from "@/components/attendance/AttendanceSettings";

/**
 * Everyone's attendance, and the settings that govern it.
 *
 * Admin side, deliberately. These briefly sat on /attendance, which is the
 * page a receptionist opens to start their day - so the week-off patterns and
 * the face-match threshold were on screen next to "Start My Day". Policy is
 * not something a staff member needs beside their own check-in, even when
 * they happen to be an admin.
 *
 * /attendance keeps one job: one person's own day.
 */
export default function AttendanceAdmin() {
  return (
    <div className="p-4 md:p-6 space-y-5">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-2xl font-semibold font-display flex items-center gap-2">
          <CalendarCheck className="h-6 w-6 text-primary" />Attendance
        </h1>
        <Button asChild variant="outline" size="sm" className="gap-2">
          <Link to="/attendance"><UserCheck className="h-4 w-4" />My attendance</Link>
        </Button>
      </header>

      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">All staff</TabsTrigger>
          <TabsTrigger value="policy">Policy</TabsTrigger>
          <TabsTrigger value="week-offs">Week offs</TabsTrigger>
          <TabsTrigger value="holidays">Holidays</TabsTrigger>
        </TabsList>
        <TabsContent value="all" className="mt-4"><TeamAttendance /></TabsContent>
        <TabsContent value="policy" className="mt-4"><AttendancePolicyTab /></TabsContent>
        <TabsContent value="week-offs" className="mt-4"><WeekOffsTab /></TabsContent>
        <TabsContent value="holidays" className="mt-4"><HolidaysTab /></TabsContent>
      </Tabs>
    </div>
  );
}
