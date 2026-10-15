import { importPKCS8, SignJWT } from "jose";

// Data can only be fetched on the server. Never import this module from a client component.
// These IDs identify the *source* Google Sheets, not public CSV exports.
type Source = "gold" | "bonus";
type SheetKind = "DATA" | "INSTALLMENTS" | "CUSTOMER_STATUS" | "INCENTIVE_DEDUCTIONS";
type SheetRow = Array<string | number | boolean | null>;

const SHEETS: SheetKind[] = ["DATA", "INSTALLMENTS", "CUSTOMER_STATUS", "INCENTIVE_DEDUCTIONS"];
// Source spreadsheet IDs from the links supplied by the user.
// Vercel environment variables override these, if the sheet is ever moved.
const DEFAULT_SHEET_IDS: Record<Source, string> = {
  gold: "1IY6IjtAGEKg36an_7iRShG4aAwRkf376E9q1imZIhDk",
  bonus: "1ZC8b4suFgSYV-7yTBM2jsa-RAGftqhBYySySXauCtgo"
};
// A previous patch accidentally substituted digit 1 for capital I in Gold's ID.
// Normalize that *exact* known typo, including an old Vercel env override.
const OLD_GOLD_ID_TYPO = "11Y6IjtAGEKg36an_7iRShG4aAwRkf376E9q1imZIhDk";
const CACHE_MS = 60_000;
const REQUEST_TIMEOUT_MS = 12_000;
const cache = new Map<string, { expires: number; rows: SheetRow[] }>();
const pending = new Map<string, Promise<SheetRow[]>>();
let tokenCache: { accessToken: string; expires: number } | null = null;

function config() {
  const email = String(process.env.GOOGLE_SHEETS_CLIENT_EMAIL || "").trim();
  const privateKey = String(process.env.GOOGLE_SHEETS_PRIVATE_KEY || "").replace(/\\n/g, "\n").trim();
  if (!email || !privateKey) throw new Error("Google Sheets service account is not configured.");
  return { email, privateKey };
}

async function getAccessToken(): Promise<string> {
  if (tokenCache && tokenCache.expires > Date.now()) return tokenCache.accessToken;
  const { email, privateKey } = config();
  const key = await importPKCS8(privateKey, "RS256");
  const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/spreadsheets.readonly" })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(email)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt()
    .setExpirationTime("55m")
    .sign(key);
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    }).toString(),
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  if (!response.ok) throw new Error("Google Sheets authentication failed. Check server credentials.");
  const data = await response.json();
  if (!data.access_token) throw new Error("Google Sheets returned no access token.");
  tokenCache = { accessToken: String(data.access_token), expires: Date.now() + Math.min(50 * 60, (Number(data.expires_in || 3600) - 120) * 1000) };
  return tokenCache.accessToken;
}

function sourceId(source: Source): string {
  const configuredId = (source === "gold" ? process.env.NEEV_GOLD_SPREADSHEET_ID : process.env.NEEV_BONUS_SPREADSHEET_ID)?.trim();
  const rawId = configuredId || DEFAULT_SHEET_IDS[source];
  const id = source === "gold" && rawId === OLD_GOLD_ID_TYPO ? DEFAULT_SHEET_IDS.gold : rawId;
  if (!id) throw new Error(`${source === "gold" ? "Neev Gold" : "Neev Bonus"} Sheet ID is not configured.`);
  if (!/^[\w-]+$/.test(id)) throw new Error("Google Sheet ID is invalid.");
  return id;
}

async function readSheet(source: Source, kind: SheetKind): Promise<SheetRow[]> {
  const id = sourceId(source);
  const cacheKey = `${id}:${kind}`;
  const found = cache.get(cacheKey);
  if (found && found.expires > Date.now()) return found.rows;
  const existing = pending.get(cacheKey);
  if (existing) return existing;

  const operation = (async () => {
    const token = await getAccessToken();
    const range = `${kind}!A:${kind === "DATA" ? "J" : kind === "INSTALLMENTS" ? "L" : kind === "CUSTOMER_STATUS" ? "G" : "I"}`;
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}/values/${encodeURIComponent(range)}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`;
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (!response.ok) {
      // Optional sheets might not have been created by the tracker yet.
      if (response.status === 400 && (kind === "CUSTOMER_STATUS" || kind === "INCENTIVE_DEDUCTIONS")) {
        const message = JSON.stringify(await response.json().catch(() => ({})));
        if (/Unable to parse range|does not exist/i.test(message)) return [];
      }
      if (response.status === 404 && source === "gold") {
        throw new Error("Neev Gold Google Sheet not accessible (404). Check that the Gold Sheet is shared as Viewer with the Google service-account email and verify NEEV_GOLD_SPREADSHEET_ID in Vercel.");
      }
      throw new Error(`Unable to read ${source === "gold" ? "Neev Gold" : "Neev Bonus"} ${kind} sheet (${response.status}). Check sharing and API access.`);
    }
    const data = await response.json();
    const rows = Array.isArray(data.values) ? (data.values as SheetRow[]).slice(1) : [];
    cache.set(cacheKey, { rows, expires: Date.now() + CACHE_MS });
    return rows;
  })();
  pending.set(cacheKey, operation);
  try {
    return await operation;
  } finally {
    pending.delete(cacheKey);
  }
}

export async function readSchemeSheets(source: Source) {
  const [registrations, installments, statuses, deductions] = await Promise.all(SHEETS.map(kind => readSheet(source, kind)));
  return { registrations, installments, statuses, deductions };
}
