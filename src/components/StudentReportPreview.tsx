import type { StudentReport } from "@/lib/api";

function formatTime(value?: string | null): string {
  if (!value) {
    return "—";
  }
  return String(value).slice(0, 5);
}

type StudentReportPreviewProps = {
  report: StudentReport;
};

export function StudentReportPreview({ report }: StudentReportPreviewProps) {
  const attendance = report.attendance.summary;

  return (
    <div className="space-y-6 p-5 text-sm">
      <div>
        <p className="text-xs text-muted-foreground">
          {report.period.start_date} to {report.period.end_date}
        </p>
        <p className="mt-1 font-medium text-foreground">
          {report.student.display_name || "Student"}
          <span className="font-normal text-muted-foreground">
            {" "}
            · {report.student.email}
            {report.student.grade ? ` · Grade ${report.student.grade}` : ""}
          </span>
        </p>
      </div>

      <section className="space-y-2">
        <h3 className="text-base font-semibold">Attendance</h3>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full border border-border px-2.5 py-1 text-xs">
            Total: {attendance.total}
          </span>
          <span className="rounded-full border border-border px-2.5 py-1 text-xs">
            Present: {attendance.present}
          </span>
          <span className="rounded-full border border-border px-2.5 py-1 text-xs">
            Late: {attendance.late}
          </span>
          <span className="rounded-full border border-border px-2.5 py-1 text-xs">
            Absent: {attendance.absent}
          </span>
          <span className="rounded-full border border-border px-2.5 py-1 text-xs">
            Unrecorded: {attendance.unrecorded}
          </span>
        </div>
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-muted/40">
              <tr>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Class</th>
                <th className="px-3 py-2 font-medium">Session</th>
                <th className="px-3 py-2 font-medium">Time</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody>
              {report.attendance.sessions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-3 text-muted-foreground">
                    No sessions in this period.
                  </td>
                </tr>
              ) : (
                report.attendance.sessions.map((session) => (
                  <tr key={`${session.date}-${session.class_name}-${session.title}`} className="border-t border-border/60">
                    <td className="px-3 py-2">{session.date || "—"}</td>
                    <td className="px-3 py-2">{session.class_name || "—"}</td>
                    <td className="px-3 py-2">{session.title || "—"}</td>
                    <td className="px-3 py-2">
                      {formatTime(session.start_time)}-{formatTime(session.end_time)}
                    </td>
                    <td className="px-3 py-2 capitalize">{session.attendance_status || "—"}</td>
                    <td className="px-3 py-2">{session.notes || "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-base font-semibold">Assignments</h3>
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-muted/40">
              <tr>
                <th className="px-3 py-2 font-medium">Assignment</th>
                <th className="px-3 py-2 font-medium">Class</th>
                <th className="px-3 py-2 font-medium">Due</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Grade</th>
                <th className="px-3 py-2 font-medium">Feedback</th>
              </tr>
            </thead>
            <tbody>
              {report.assignments.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-3 text-muted-foreground">
                    No assignments in this period.
                  </td>
                </tr>
              ) : (
                report.assignments.map((assignment) => (
                  <tr key={`${assignment.title}-${assignment.class_name}-${assignment.due_date}`} className="border-t border-border/60">
                    <td className="px-3 py-2">{assignment.title || "—"}</td>
                    <td className="px-3 py-2">{assignment.class_name || "—"}</td>
                    <td className="px-3 py-2">
                      {assignment.due_date ? String(assignment.due_date).slice(0, 10) : "—"}
                    </td>
                    <td className="px-3 py-2 capitalize">{assignment.status || "—"}</td>
                    <td className="px-3 py-2">{assignment.grade || "—"}</td>
                    <td className="px-3 py-2">{assignment.feedback || "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-base font-semibold">Balance</h3>
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-muted/40">
              <tr>
                <th className="px-3 py-2 font-medium">Class</th>
                <th className="px-3 py-2 font-medium">Remaining</th>
              </tr>
            </thead>
            <tbody>
              {report.balances.length === 0 ? (
                <tr>
                  <td colSpan={2} className="px-3 py-3 text-muted-foreground">
                    No balance records.
                  </td>
                </tr>
              ) : (
                report.balances.map((balance) => (
                  <tr key={balance.class_name} className="border-t border-border/60">
                    <td className="px-3 py-2">{balance.class_name}</td>
                    <td className="px-3 py-2">
                      {Number(balance.balance).toFixed(Number.isInteger(balance.balance) ? 0 : 2)}{" "}
                      {balance.unit}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-base font-semibold">Teacher note</h3>
        <p className="whitespace-pre-wrap rounded-md border border-border bg-muted/20 px-3 py-2 text-sm text-foreground">
          {report.teacher_note.content?.trim() || "No teacher note added."}
        </p>
      </section>
    </div>
  );
}
