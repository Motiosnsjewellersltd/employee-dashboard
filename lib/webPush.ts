import {
  createCipheriv,
  createECDH,
  createHmac,
  createPrivateKey,
  randomBytes,
  sign as cryptoSign,
} from "crypto";
import { prisma } from "@/lib/prisma";

export type PushPayload = {
  title: string;
  body: string;
  url: string;
  tag?: string;
  icon?: string;
  badge?: string;
};

function fromBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="), "base64");
}

function toBase64Url(value: Buffer | Uint8Array | string) {
  return Buffer.from(value).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function hkdfExtract(salt: Buffer, inputKeyMaterial: Buffer) {
  return createHmac("sha256", salt).update(inputKeyMaterial).digest();
}

function hkdfExpand(pseudoRandomKey: Buffer, info: Buffer, length: number) {
  const blocks: Buffer[] = [];
  let previous = Buffer.alloc(0);
  let counter = 1;
  while (Buffer.concat(blocks).length < length) {
    previous = createHmac("sha256", pseudoRandomKey)
      .update(Buffer.concat([previous, info, Buffer.from([counter])]))
      .digest();
    blocks.push(previous);
    counter += 1;
  }
  return Buffer.concat(blocks).subarray(0, length);
}

function vapidConfig() {
  const publicKey = String(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "").trim();
  const privateKey = String(process.env.VAPID_PRIVATE_KEY || "").trim();
  const subject = String(process.env.VAPID_SUBJECT || "").trim();
  if (!publicKey || !privateKey || !subject) return null;
  return { publicKey, privateKey, subject };
}

export function isWebPushConfigured() {
  return Boolean(vapidConfig());
}

export function getVapidPublicKey() {
  return vapidConfig()?.publicKey || "";
}

function createVapidJwt(endpoint: string, publicKey: string, privateKey: string, subject: string) {
  const publicBytes = fromBase64Url(publicKey);
  const privateBytes = fromBase64Url(privateKey);
  if (publicBytes.length !== 65 || publicBytes[0] !== 4 || privateBytes.length !== 32) {
    throw new Error("Invalid VAPID keys.");
  }

  const header = toBase64Url(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const payload = toBase64Url(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + (12 * 60 * 60),
    sub: subject,
  }));
  const unsignedToken = `${header}.${payload}`;
  const key = createPrivateKey({
    key: {
      kty: "EC",
      crv: "P-256",
      x: toBase64Url(publicBytes.subarray(1, 33)),
      y: toBase64Url(publicBytes.subarray(33, 65)),
      d: toBase64Url(privateBytes),
    },
    format: "jwk",
  });
  const signature = cryptoSign("sha256", Buffer.from(unsignedToken), { key, dsaEncoding: "ieee-p1363" });
  return `${unsignedToken}.${toBase64Url(signature)}`;
}

function encryptPayload(payload: Buffer, clientPublicKey: string, clientAuthSecret: string) {
  const receiverPublicKey = fromBase64Url(clientPublicKey);
  const authSecret = fromBase64Url(clientAuthSecret);
  if (receiverPublicKey.length !== 65 || receiverPublicKey[0] !== 4 || authSecret.length < 16) {
    throw new Error("Invalid push subscription keys.");
  }

  const sender = createECDH("prime256v1");
  const senderPublicKey = sender.generateKeys();
  const sharedSecret = sender.computeSecret(receiverPublicKey);
  const authPrk = hkdfExtract(authSecret, sharedSecret);
  const keyInfo = Buffer.concat([
    Buffer.from("WebPush: info\0", "utf8"),
    receiverPublicKey,
    senderPublicKey,
  ]);
  const inputKeyMaterial = hkdfExpand(authPrk, keyInfo, 32);
  const salt = randomBytes(16);
  const contentPrk = hkdfExtract(salt, inputKeyMaterial);
  const contentEncryptionKey = hkdfExpand(contentPrk, Buffer.from("Content-Encoding: aes128gcm\0"), 16);
  const nonce = hkdfExpand(contentPrk, Buffer.from("Content-Encoding: nonce\0"), 12);
  const record = Buffer.concat([payload, Buffer.from([2])]);
  const cipher = createCipheriv("aes-128-gcm", contentEncryptionKey, nonce);
  const ciphertext = Buffer.concat([cipher.update(record), cipher.final(), cipher.getAuthTag()]);
  const recordSize = Buffer.alloc(4);
  recordSize.writeUInt32BE(4096, 0);
  return Buffer.concat([salt, recordSize, Buffer.from([senderPublicKey.length]), senderPublicKey, ciphertext]);
}

async function sendOne(subscription: { endpoint: string; p256dh: string; auth: string }, payload: PushPayload) {
  const config = vapidConfig();
  if (!config) return { ok: false, status: 0 };
  const compactPayload: PushPayload = {
    ...payload,
    title: String(payload.title || "Employee Dashboard").slice(0, 100),
    body: String(payload.body || "").slice(0, 1200),
    icon: payload.icon || "/icons/icon-192.png",
    badge: payload.badge || "/icons/icon-192.png",
  };
  const body = encryptPayload(Buffer.from(JSON.stringify(compactPayload)), subscription.p256dh, subscription.auth);
  const token = createVapidJwt(subscription.endpoint, config.publicKey, config.privateKey, config.subject);
  const response = await fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      Authorization: `vapid t=${token}, k=${config.publicKey}`,
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: "86400",
      Urgency: "high",
    },
    body,
  });
  return { ok: response.ok, status: response.status };
}

export async function sendPushToEmployees(employeeIds: string[], payload: PushPayload) {
  const ids = Array.from(new Set(employeeIds.filter(Boolean)));
  if (!ids.length || !isWebPushConfigured()) return;
  const subscriptions = await prisma.pushSubscription.findMany({
    where: { employeeId: { in: ids } },
    select: { id: true, endpoint: true, p256dh: true, auth: true },
  });
  if (!subscriptions.length) return;

  const expiredIds: string[] = [];
  await Promise.all(subscriptions.map(async subscription => {
    try {
      const result = await sendOne(subscription, payload);
      if (result.status === 404 || result.status === 410) expiredIds.push(subscription.id);
    } catch {
      // A failed device must never stop the main dashboard action.
    }
  }));
  if (expiredIds.length) {
    await prisma.pushSubscription.deleteMany({ where: { id: { in: expiredIds } } }).catch(() => null);
  }
}
