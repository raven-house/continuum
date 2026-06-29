/**
 * Assertions on the attested set and the post-claim on-chain state.
 */

import { AztecAddress } from "@aztec/aztec.js/addresses";
import { Contract } from "@aztec/aztec.js/contracts";

import { ALICE_TOKENS, OTHER_TOKEN } from "./config.js";
import type { TokenAttestation } from "./continuum-api.js";
import { getPrivateNftIds, migrateAndClaim, publicOwnerOf } from "./nft.js";

/** The attested set must be exactly Alice's tokens — the third party's is excluded. */
export function assertExpectedTokens(tokens: TokenAttestation[]): void {
  const ids = tokens.map((t) => BigInt(t.token_id));
  if (ids.includes(OTHER_TOKEN)) {
    throw new Error(`ownership filter failed: token #${OTHER_TOKEN} should not have been signed`);
  }
  for (const t of ALICE_TOKENS) {
    if (!ids.includes(t)) {
      throw new Error(`expected token #${t} in the attested set, got [${ids.join(", ")}]`);
    }
  }
}

/** After claiming: tokens are private notes with zero public owner, and re-claiming reverts. */
export async function verifyClaims(
  nft: Contract,
  owner: AztecAddress,
  tokens: TokenAttestation[],
): Promise<void> {
  console.log("\n[VERIFY] reading post-claim state...");
  const ownedIds = await getPrivateNftIds(nft, owner);
  console.log(`  Alice-NEW private notes: [${ownedIds.join(", ")}]`);

  for (const t of ALICE_TOKENS) {
    if (!ownedIds.includes(t)) {
      throw new Error(`token #${t} missing from Alice-NEW's private notes`);
    }
    if ((await publicOwnerOf(nft, t, owner)) !== 0n) {
      throw new Error(`token #${t} public owner should be zero (privately owned)`);
    }
  }
  console.log("  ✓ all claimed tokens are private notes with zero public owner");

  console.log("\n[VERIFY] double-claim must be rejected...");
  const first = tokens[0];
  try {
    await migrateAndClaim(nft, first.token_id, first.signature_bytes, owner);
    throw new Error("second claim should have reverted but did not");
  } catch (err) {
    if (err instanceof Error && err.message.includes("should have reverted")) throw err;
    console.log("  ✓ second claim correctly rejected (double-claim guard)");
  }
}
