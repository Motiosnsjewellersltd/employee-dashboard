// Temporary self-service preview for the selected employee only.
export function canViewAttendanceCalendar(
  viewer: { id: string; role: string },
  employee: { id: string; employeeCode?: string | null }
) {
  if (viewer.role === "ADMIN" || viewer.role === "HR") return true;
  return viewer.role === "EMPLOYEE" && viewer.id === employee.id && employee.employeeCode === "7349";
}
