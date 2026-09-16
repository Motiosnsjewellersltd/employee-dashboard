import { createECDH } from "node:crypto";

const ecdh = createECDH("prime256v1");
const publicKey = ecdh.generateKeys();
const privateKey = ecdh.getPrivateKey();
const base64url = value => Buffer.from(value).toString("base64url");

console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${base64url(publicKey)}`);
console.log(`VAPID_PRIVATE_KEY=${base64url(privateKey)}`);
console.log("VAPID_SUBJECT=mailto:your-email@example.com");
