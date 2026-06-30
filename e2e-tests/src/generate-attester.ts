import { Fr } from "@aztec/aztec.js/fields";
import { Attester } from "./index.js";

async function main() {
  const secret = process.env.ATTESTER_SECRET
    ? Fr.fromHexString(process.env.ATTESTER_SECRET)
    : Fr.random();
  const reused = Boolean(process.env.ATTESTER_SECRET);

  const attester = await Attester.create(secret);

  console.log("=== Continuum attester key pair ===\n");
  console.log(reused ? "(re-derived from the ATTESTER_SECRET you passed)\n" : "(freshly generated)\n");

  console.log(`ATTESTER_SECRET=${secret.toString()}`);
  console.log(`ATTESTER_PUBKEY_X=${attester.publicKey.x.toString()}`);
  console.log(`ATTESTER_PUBKEY_Y=${attester.publicKey.y.toString()}`);

  console.log("\nWhere these go:");
  console.log("  • ATTESTER_SECRET → PRIVATE. Set in continuum/.env; the API derives everything from it.");
  console.log("    Restart the API after changing it. This is all the migrate-nft flow needs.");
  console.log("  • ATTESTER_PUBKEY_X/Y → PUBLIC, derived from the secret. The migrate-nft scripts fetch");
  console.log("    these live from GET /attester.");
}

main().catch((err) => {
  console.error("\nKey generation failed:", err);
  process.exit(1);
});
