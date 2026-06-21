/** Shared grade labels for student profile and filters (P1-05) */
export const STUDENT_GRADE_OPTIONS = [
  "Grade 9",
  "Grade 10",
  "Grade 11",
  "Grade 12",
] as const;

export type StudentGradeOption = (typeof STUDENT_GRADE_OPTIONS)[number];
