import { notificationTime as reminderHistoryTime } from "@/lib/notificationTime";
import styles from "./LeaveWorkflow.module.css";
export type DeliveryRecipient = { name: string; role?: string; readAt?: string | null; pushStatus?: string | null; pushAttemptedAt?: string | null; pushAcceptedAt?: string | null; pushAttemptedDevices?: number | null; pushAcceptedDevices?: number | null };
export function pushStatusLabel(person: DeliveryRecipient) {
  if (person.pushAcceptedAt && person.pushStatus === "ACCEPTED") return `Push Accepted (${person.pushAcceptedDevices ?? 1}/${person.pushAttemptedDevices ?? 1} devices)`;
  return ({ FAILED: "Push Failed", NO_SUBSCRIPTION: "No Push Subscription", NOT_CONFIGURED: "Push Not Configured" } as Record<string, string>)[person.pushStatus || ""] || "Push: Not Recorded";
}
export default function NotificationDelivery({ createdAt, recipients }: { createdAt: string; recipients: DeliveryRecipient[] }) {
  const accepted = recipients.filter(person => person.pushStatus === "ACCEPTED" && person.pushAcceptedAt).length;
  return <details className={styles.delivery}><summary>Delivery Status · Push Accepted: {accepted}/{recipients.length}</summary>
    <p>Created: {reminderHistoryTime(createdAt)}</p>
    {recipients.length ? recipients.map((person, index) => <div className={styles.recipient} key={index}>
      <b>{person.name}{person.role ? ` (${person.role})` : ""}</b>
      <span>{pushStatusLabel(person)}</span>
      {person.pushAcceptedAt ? <span>Accepted: {reminderHistoryTime(person.pushAcceptedAt)}</span> : person.pushAttemptedAt ? <span>Checked: {reminderHistoryTime(person.pushAttemptedAt)}</span> : null}
      <span>{person.readAt ? `Read: ${reminderHistoryTime(person.readAt)}` : "Read: Not marked read"}</span>
    </div>) : <p>Recipient record unavailable</p>}
    <p className={styles.note}>Push Accepted confirms push-service acceptance, not phone delivery. Read uses the app’s read flag, including Mark All Read / Clear All. Older push results are not recorded.</p>
  </details>;
}
