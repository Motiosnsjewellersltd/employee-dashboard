export function notificationTime(value: string | null) {
  if (!value) return "—";
  const date = new Date(value); if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }).format(date).replace(/\b(am|pm)\b/g, text => text.toUpperCase()) + " IST";
}
