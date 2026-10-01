import type { StudentReport } from "@/lib/api";

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function buildStudentReportHtml(report: StudentReport): string {
  const attendance = report.attendance.summary;
  const assignments = report.assignments;
  const rows = (content: string) => `<tr>${content}</tr>`;
  const cell = (content: string) => `<td>${content || "—"}</td>`;

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>EduSync report - ${escapeHtml(report.student.display_name || report.student.email)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #111827; margin: 32px; }
    h1 { margin-bottom: 4px; }
    h2 { margin-top: 28px; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 13px; }
    th, td { border: 1px solid #e5e7eb; padding: 8px; text-align: left; vertical-align: top; }
    th { background: #f9fafb; }
    .muted { color: #6b7280; }
    .summary { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 12px; }
    .pill { border: 1px solid #e5e7eb; border-radius: 999px; padding: 6px 10px; font-size: 13px; }
    @media print { body { margin: 18mm; } }
  </style>
</head>
<body>
  <h1>Student Progress Report</h1>
  <p class="muted">${escapeHtml(report.period.start_date)} to ${escapeHtml(report.period.end_date)}</p>
  <p><strong>${escapeHtml(report.student.display_name || "Student")}</strong> · ${escapeHtml(report.student.email)}${report.student.grade ? ` · Grade ${escapeHtml(report.student.grade)}` : ""}</p>

  <h2>Attendance</h2>
  <div class="summary">
    <span class="pill">Total sessions: ${attendance.total}</span>
    <span class="pill">Present: ${attendance.present}</span>
    <span class="pill">Late: ${attendance.late}</span>
    <span class="pill">Absent: ${attendance.absent}</span>
    <span class="pill">Unrecorded: ${attendance.unrecorded}</span>
  </div>
  <table>
    <thead><tr><th>Date</th><th>Class</th><th>Session</th><th>Time</th><th>Status</th><th>Notes</th></tr></thead>
    <tbody>
      ${report.attendance.sessions
        .map((session) =>
          rows(
            cell(escapeHtml(session.date)) +
              cell(escapeHtml(session.class_name)) +
              cell(escapeHtml(session.title)) +
              cell(
                `${escapeHtml(String(session.start_time || "").slice(0, 5))}-${escapeHtml(String(session.end_time || "").slice(0, 5))}`,
              ) +
              cell(escapeHtml(session.attendance_status)) +
              cell(escapeHtml(session.notes)),
          ),
        )
        .join("") || rows(`<td colspan="6">No sessions in this period.</td>`)}
    </tbody>
  </table>

  <h2>Assignments</h2>
  <table>
    <thead><tr><th>Assignment</th><th>Class</th><th>Due</th><th>Status</th><th>Grade</th><th>Feedback</th></tr></thead>
    <tbody>
      ${assignments
        .map((assignment) =>
          rows(
            cell(escapeHtml(assignment.title)) +
              cell(escapeHtml(assignment.class_name)) +
              cell(escapeHtml(assignment.due_date ? String(assignment.due_date).slice(0, 10) : "")) +
              cell(escapeHtml(assignment.status)) +
              cell(escapeHtml(assignment.grade || "")) +
              cell(escapeHtml(assignment.feedback)),
          ),
        )
        .join("") || rows(`<td colspan="6">No assignments in this period.</td>`)}
    </tbody>
  </table>

  <h2>Balance</h2>
  <table>
    <thead><tr><th>Class</th><th>Remaining</th></tr></thead>
    <tbody>
      ${report.balances
        .map((balance) =>
          rows(
            cell(escapeHtml(balance.class_name)) +
              cell(
                `${Number(balance.balance).toFixed(Number.isInteger(balance.balance) ? 0 : 2)} ${escapeHtml(balance.unit)}`,
              ),
          ),
        )
        .join("") || rows(`<td colspan="2">No balance records.</td>`)}
    </tbody>
  </table>

  <h2>Teacher Note</h2>
  <p>${escapeHtml(report.teacher_note.content || "No teacher note added.")}</p>
</body>
</html>`;
}

function reportFileName(report: StudentReport): string {
  const slug = (report.student.display_name || report.student.email || "student")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `edusync-report-${slug || "student"}.html`;
}

/** Download report as HTML — never blocked by popup settings. */
export function downloadStudentReport(report: StudentReport): void {
  const blob = new Blob([buildStudentReportHtml(report)], {
    type: "text/html;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = reportFileName(report);
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Print via a hidden iframe — does not use window.open, so popups are not required. */
export function printStudentReport(report: StudentReport): void {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.style.opacity = "0";
  iframe.style.pointerEvents = "none";
  document.body.appendChild(iframe);

  const frameWindow = iframe.contentWindow;
  const frameDocument = frameWindow?.document;
  if (!frameWindow || !frameDocument) {
    iframe.remove();
    throw new Error("Could not open print preview. Try downloading the report instead.");
  }

  frameDocument.open();
  frameDocument.write(buildStudentReportHtml(report));
  frameDocument.close();

  const cleanup = () => {
    window.setTimeout(() => iframe.remove(), 500);
  };

  frameWindow.addEventListener("afterprint", cleanup, { once: true });
  window.setTimeout(() => {
    frameWindow.focus();
    frameWindow.print();
  }, 250);
}
