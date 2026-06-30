import { Fr } from "@aztec/aztec.js/fields";

import { deriveSigningKey } from "@aztec/stdlib/keys";
import { Schnorr } from "@aztec/foundation/crypto/schnorr";
// Generate a random attestor secret key
async function main() {
  const secret = Fr.random()
  const signingKey = deriveSigningKey(secret);
  const schnorr = new Schnorr();
  const pubKey = await schnorr.computePublicKey(signingKey);

  console.log("=== Continuum attester key pair ===\n");
  console.log("Copy this exact line into continuum/.env (create the file if it doesn't exist):\n");
  console.log(`ATTESTER_SECRET=${secret.toString()}\n`);
  console.log("Then restart the API so it picks up the new secret.\n");
  console.log("Important:");
  console.log("  • ATTESTER_SECRET is PRIVATE — never commit it.");
  console.log("  • The API derives the public key from ATTESTER_SECRET, so you don't need to set");
  console.log("    ATTESTER_PUBKEY_X/Y in .env.");
  console.log("  • The migrate-nft scripts fetch ATTESTER_PUBKEY_X/Y live from GET /attester.\n");
  console.log("Derived public key (for reference only):");
  console.log(`ATTESTER_PUBKEY_X=${pubKey.x.toString()}`);
  console.log(`ATTESTER_PUBKEY_Y=${pubKey.y.toString()}`);
}

main().catch((err) => {
  console.error("\nKey generation failed:", err);
  process.exit(1);
});
