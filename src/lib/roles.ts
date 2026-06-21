/** Normalize API/localStorage role strings for comparisons. */
export function normalizeRole(role?: string | null): string {
  return (role ?? "").trim().toLowerCase();
}

export function isTeacherRole(role?: string | null): boolean {
  return normalizeRole(role) === "teacher";
}

export function isStudentRole(role?: string | null): boolean {
  return normalizeRole(role) === "student";
}

/** Where to land after login — avoid sending students to teacher-only URLs. */
export function getPostLoginPath(
  role: string,
  fromPath?: string | null,
): string {
  const normalized = normalizeRole(role);
  const from = fromPath && fromPath !== "/login" ? fromPath : null;

  if (normalized === "student") {
    const studentPaths = new Set([
      "/classes",
      "/calendar",
      "/dashboard",
      "/assignments",
      "/tuition",
      "/notifications",
    ]);
    if (from && studentPaths.has(from)) {
      return from;
    }
    return "/classes";
  }

  if (from && from !== "/") {
    return from;
  }

  return "/dashboard";
}
