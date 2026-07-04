import crypto from "node:crypto";

/** Verifies an ECDSA (P-256) signature over a SHA-256 hash. Never throws. */
export function verifySignature(
  hashHex: string,
  signatureBase64: string,
  publicKeyPem: string
): boolean {
  try {
    const verifier = crypto.createVerify("SHA256");
    verifier.update(hashHex);
    verifier.end();
    return verifier.verify(publicKeyPem, Buffer.from(signatureBase64, "base64"));
  } catch {
    return false;
  }
}
