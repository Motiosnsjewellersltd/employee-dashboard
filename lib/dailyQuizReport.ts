import type { Prisma } from "@prisma/client";
export type QuizPerson = { employeeId: string; name: string };
export function quizAudience(value: Prisma.JsonValue | undefined): QuizPerson[] | null {
  if (!Array.isArray(value)) return null;
  const people = new Map<string, QuizPerson>();
  for (const item of value) if (item && typeof item === "object" && !Array.isArray(item) && typeof item.employeeId === "string" && typeof item.name === "string") people.set(item.employeeId, { employeeId: item.employeeId, name: item.name });
  return [...people.values()];
}
export function quizAudienceAllows(value: Prisma.JsonValue | undefined, employeeId: string) {
  const people = quizAudience(value); return people === null || people.some(person => person.employeeId === employeeId);
}
export function questionNotificationWhere(id: string, date: string) {
  return { filterType: "SYSTEM", OR: [
    { filterValue: `DAILY_JEWELLERY_QUIZ:${date}` },
    { AND: [{ filterValue: { startsWith: "DAILY_JEWELLERY_QUIZ:" } }, { filterValue: { endsWith: `:${id}` } }] }
  ] };
}
export function quizQuestionReport(question: { isPublished: boolean; audience?: Prisma.JsonValue; answers: Array<{ employeeId: string; isCorrect: boolean; employee: { name: string } }> }, fallback: QuizPerson[] = []) {
  const people = new Map((quizAudience(question.audience) ?? (question.isPublished ? fallback : [])).map(person => [person.employeeId, person]));
  const correct = new Map<string, string>(), wrong = new Map<string, string>();
  for (const answer of question.answers) {
    people.set(answer.employeeId, { employeeId: answer.employeeId, name: answer.employee.name });
    (answer.isCorrect ? correct : wrong).set(answer.employeeId, answer.employee.name);
  }
  const answered = new Set([...correct.keys(), ...wrong.keys()]);
  const order = (names: string[]) => names.sort((a,b) => a.localeCompare(b, "en"));
  const names = { correct: order([...correct.values()]), wrong: order([...wrong.values()]), noResponse: order([...people.values()].filter(person => !answered.has(person.employeeId)).map(person => person.name)) };
  return { total: people.size, correct: names.correct.length, wrong: names.wrong.length, noResponse: names.noResponse.length, names };
}
