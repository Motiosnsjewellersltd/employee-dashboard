import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
const repository = "motisonsjewellersltd/employee-dashboard";
const keys = createRemoteJWKSet(new URL("https://token.actions.githubusercontent.com/.well-known/jwks"), { timeoutDuration: 5000 });
export function validLeaveSchedulerClaims(claims: JWTPayload) {
  return String(claims.repository || "").toLowerCase() === repository && claims.ref === "refs/heads/main" &&
    String(claims.workflow_ref || "").toLowerCase() === `${repository}/.github/workflows/leave-reminders.yml@refs/heads/main` &&
    ["push", "schedule", "workflow_dispatch"].includes(String(claims.event_name));
}
export async function authenticateLeaveScheduler(request: Request) {
  const header = request.headers.get("authorization") || "";
  if (!header.startsWith("Bearer ") || header.length > 20000) return false;
  try {
    const { payload } = await jwtVerify(header.slice(7), keys, {
      issuer: "https://token.actions.githubusercontent.com", audience: "motisons-leave-reminders", algorithms: ["RS256"],
      requiredClaims: ["iat", "exp", "repository", "ref", "workflow_ref", "event_name"], maxTokenAge: "10m", clockTolerance: 5
    });
    return validLeaveSchedulerClaims(payload);
  } catch { return false; }
}
