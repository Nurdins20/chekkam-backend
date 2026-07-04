// Generates an ECDSA (P-256) key pair for a new institution (SRS Section 10.1).
// Usage: npm run generate-signing-key
import crypto from "node:crypto";

const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", {
  namedCurve: "prime256v1",
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

console.log("Public key (store in institutions.signing_public_key):\n");
console.log(publicKey);
console.log("Private key (store ONLY as an env var, never in the database):\n");
console.log(privateKey);
console.log(
  "Tip: for a one-line .env value, replace real newlines with the two characters \\n, e.g.:\n"
);
console.log(privateKey.replace(/\n/g, "\\n"));
