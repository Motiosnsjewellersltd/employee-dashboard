export const DAILY_QUIZ_KEY = "dailyJewelleryQuizPilot";
export const DAILY_QUIZ_LAST_RUN = "dailyJewelleryQuizLastRun";
export const DEFAULT_QUIZ_MESSAGES = [
  "💎 आज का Jewellery सवाल तैयार है! अपना जवाब चुनें।",
  "🤔 Gold, Diamond या customer handling—आज कुछ नया सीखें! सवाल खोलें।",
  "✨ 20 सेकंड निकालें—आज का Jewellery सवाल आपका इंतज़ार कर रहा है।",
  "💍 एक छोटा सवाल, कुछ नई जानकारी! आज का quiz देखें।",
  "💡 आज का जवाब अभी बाकी है। अपनी jewellery knowledge आज़माएँ!",
  "🔔 आज का Jewellery सवाल भूल तो नहीं गए? अभी जवाब दें।"
];
export type QuizSettings = { enabled: boolean; notificationsEnabled: boolean; targetEmployeeId: string; intervalMinutes: number; startHour: number; endHour: number; messages: string[] };
export const DEFAULT_QUIZ_SETTINGS: QuizSettings = { enabled: true, notificationsEnabled: true, targetEmployeeId: "", intervalMinutes: 60, startHour: 10, endHour: 20, messages: DEFAULT_QUIZ_MESSAGES };
export function isQuizPreviewName(name: unknown) { return String(name || "").trim().replace(/\s+/g, " ").toLowerCase() === "ghanshyam jangir"; }
export function quizIndiaTime(now = new Date()) {
  const local = new Date(now.getTime() + 330 * 60000);
  return { date: local.toISOString().slice(0, 10), minute: local.getUTCHours() * 60 + local.getUTCMinutes() };
}
export function validQuizDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00Z"); return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function parseQuizSettings(value?: string | null): QuizSettings {
  try { const data = JSON.parse(value || "{}"); return validateQuizSettings({ ...DEFAULT_QUIZ_SETTINGS, ...data }); } catch { return { ...DEFAULT_QUIZ_SETTINGS, enabled: false, notificationsEnabled: false }; }
}
export function validateQuizSettings(input: unknown): QuizSettings {
  const data = input as Partial<QuizSettings>;
  if (!data || typeof data.enabled !== "boolean" || typeof data.notificationsEnabled !== "boolean" || typeof data.targetEmployeeId !== "string" || (data.targetEmployeeId !== "" && !/^[a-zA-Z0-9_-]{1,100}$/.test(data.targetEmployeeId)) || ![30,60,120,180].includes(Number(data.intervalMinutes)) || !Number.isInteger(data.startHour) || !Number.isInteger(data.endHour) || data.startHour! < 0 || data.endHour! > 24 || data.startHour! >= data.endHour!) throw new Error("Select valid quiz settings and notification hours (IST).");
  if (!Array.isArray(data.messages) || data.messages.length < 2 || data.messages.length > 20 || data.messages.some(message => typeof message !== "string" || !message.trim() || message.trim().length > 300)) throw new Error("Enter 2–20 notification messages, each up to 300 characters.");
  if (new Set(data.messages.map(message => message.trim())).size < 2) throw new Error("Enter at least two different notification messages.");
  return { enabled: data.enabled, notificationsEnabled: data.notificationsEnabled, targetEmployeeId: data.targetEmployeeId, intervalMinutes: Number(data.intervalMinutes), startHour: data.startHour!, endHour: data.endHour!, messages: [...new Set(data.messages.map(message => message.trim()))] };
}
export function validateQuizQuestion(input: unknown) {
  const data = input as Record<string, unknown>;
  if (!data || !validQuizDate(data.date) || typeof data.question !== "string" || !data.question.trim() || data.question.trim().length > 1200 || typeof data.explanation !== "string" || !data.explanation.trim() || data.explanation.trim().length > 2400 || typeof data.isPublished !== "boolean") throw new Error("Enter a valid date, question and explanation.");
  if (!Array.isArray(data.options) || data.options.length < 3 || data.options.length > 4 || data.options.some(option => typeof option !== "string" || !option.trim() || option.trim().length > 300) || new Set(data.options.map(option => String(option).trim().toLowerCase())).size !== data.options.length || !Number.isInteger(data.correctIndex) || Number(data.correctIndex) < 0 || Number(data.correctIndex) >= data.options.length) throw new Error("Enter 3 or 4 distinct options and select the correct answer.");
  return { date: data.date, question: data.question.trim(), options: data.options.map(option => String(option).trim()), correctIndex: Number(data.correctIndex), explanation: data.explanation.trim(), isPublished: data.isPublished };
}
export function quizNotificationSlot(settings: QuizSettings, now = new Date()) {
  const { date, minute } = quizIndiaTime(now);
  if (minute < settings.startHour * 60 || minute >= settings.endHour * 60) return null;
  return { date, slot: Math.floor((minute - settings.startHour * 60) / settings.intervalMinutes) };
}

export const DAILY_QUIZ_AUDIT_ACTIONS = ["UPDATE_DAILY_QUIZ_PILOT_SETTINGS", "CREATE_DAILY_QUIZ_QUESTION", "UPDATE_DAILY_QUIZ_QUESTION", "DELETE_DAILY_QUIZ_QUESTION"];
// Additive filter: leaves every non-quiz notification's existing behavior unchanged.
export function quizNotificationVisibility(role: string, employeeId: string, name: string) {
  if (role === "ADMIN") return undefined;
  return { OR: [
    { filterValue: null },
    { NOT: { filterValue: { startsWith: "DAILY_JEWELLERY_QUIZ:" } } },
    ...(role === "EMPLOYEE" && isQuizPreviewName(name) ? [{ recipients: { some: { employeeId } } }] : [])
  ] };
}
