import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
const repository = "motiosnsjewellersltd/employee-dashboard";
const keys = createRemoteJWKSet(new URL("https://token.actions.githubusercontent.com/.well-known/jwks"), { timeoutDuration: 5000 });
export type DailyQuizSchedulerAuthFailure = { code: string; claim?: string };
function claimFailure(claims: JWTPayload): DailyQuizSchedulerAuthFailure | null {
  if (String(claims.repository || "").toLowerCase() !== repository) return { code: "SCHEDULER_REPOSITORY_MISMATCH" };
  if (claims.ref !== "refs/heads/main") return { code: "SCHEDULER_BRANCH_MISMATCH" };
  if (String(claims.workflow_ref || "").toLowerCase() !== `${repository}/.github/workflows/daily-jewellery-quiz.yml@refs/heads/main`) return { code: "SCHEDULER_WORKFLOW_MISMATCH" };
  if (!["push", "schedule", "workflow_dispatch"].includes(String(claims.event_name))) return { code: "SCHEDULER_EVENT_NOT_ALLOWED" };
  return null;
}
export function validDailyQuizSchedulerClaims(claims: JWTPayload) { return claimFailure(claims) === null; }
export async function authenticateDailyQuizScheduler(request: Request, onFailure?: (failure: DailyQuizSchedulerAuthFailure) => void) {
  const reject = (failure: DailyQuizSchedulerAuthFailure) => { onFailure?.(failure); return false; };
  const header = request.headers.get("authorization") || "";
  if (!header.startsWith("Bearer ") || header.length > 20000) return reject({ code: "SCHEDULER_BEARER_INVALID" });
  try {
    const { payload } = await jwtVerify(header.slice(7), keys, {
      issuer: "https://token.actions.githubusercontent.com", audience: "motisons-daily-jewellery-quiz", algorithms: ["RS256"],
      requiredClaims: ["iat", "exp", "repository", "ref", "workflow_ref", "event_name"], maxTokenAge: "10m", clockTolerance: 5
    });
    const failure = claimFailure(payload);
    return failure ? reject(failure) : true;
  } catch (error) {
    // Only return bounded machine-readable codes; never expose JWTs, claim values or exception messages.
    const code = error && typeof error === "object" && "code" in error && typeof error.code === "string" && /^ERR_[A-Z0-9_]{1,70}$/.test(error.code) ? error.code : "SCHEDULER_TOKEN_VERIFICATION_FAILED";
    const claim = error && typeof error === "object" && "claim" in error && typeof error.claim === "string" && ["iss", "aud", "iat", "exp", "nbf", "repository", "ref", "workflow_ref", "event_name"].includes(error.claim) ? error.claim : undefined;
    return reject({ code, ...(claim ? { claim } : {}) });
  }
}
