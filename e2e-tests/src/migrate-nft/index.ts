/**
 * End-to-end NFT public-state migration — Continuum.
 *
 * Drives the FULL flow against the real Continuum HTTP stack (Mongo + indexer +
 * API) plus an Aztec node, for PUBLICLY-owned NFTs:
 *
 *   OLD ROLLUP
 *     1. Deploy NFT "old collection" (migration disabled).
 *     2. Register the NFT artifact with the indexer  (POST /contracts/upload).
 *     3. mint_to_public() a few tokens to Alice-OLD (+ one to someone else).
 *     4. GET /migration/new-secret  → { secret, commitment }.
 *     5. Alice-OLD calls register_migration(commitment)  — owner = msg_sender,
 *        unforgeable. This is the "real caller" check, enforced on-chain.
 *
 *   NEW ROLLUP
 *     6. GET /attester  → attester pubkey (x, y).
 *     7. Deploy NFT "new collection" (migration enabled with that pubkey).
 *     8. POST /collections/register  (old → new address mapping).
 *
 *   CLAIM
 *     9. Poll POST /request_data { migration_secret } until the indexer has
 *        ingested the registration + transfers; receive per-token signatures.
 *    10. Alice-NEW calls migrate_and_claim(token_id, signature) for each token.
 *    11. Verify: tokens land as private notes for Alice-NEW, public owner is zero,
 *        and a second claim is rejected (double-claim guard).
 *
 * Prerequisites:
 *   - MongoDB + indexer + API running, indexer on the same network as AZTEC_NODE_URL.
 *   - API reachable at CONTINUUM_API_URL (default http://localhost:3004).
 *   - On testnet: a Sepolia-funded L1_PRIVATE_KEY for fee-juice bridging.
 *
 * Usage:
 *   bun run migrate-nft                                                  # testnet (default)
 *   AZTEC_NODE_URL=http://localhost:8080 CONTINUUM_NETWORK=sandbox bun run migrate-nft
 *
 * See ./config.ts for all env vars.
 */

import { Fr } from "@aztec/aztec.js/fields";
import { AztecAddress } from "@aztec/aztec.js/addresses";
import { createAztecNodeClient } from "@aztec/aztec.js/node";
import { EmbeddedWallet } from "@aztec/wallets/embedded";

import { ALICE_TOKENS, API_URL, NETWORK, NODE_URL, OTHER_TOKEN, isRemote } from "./config.js";
import { ContinuumApi } from "./continuum-api.js";
import { resolveAccounts } from "./accounts.js";
import { deployCollection, loadNftArtifact, migrateAndClaim, mintPublic, registerMigration } from "./nft.js";
import { assertExpectedTokens, verifyClaims } from "./verify.js";

const section = (title: string) => console.log(`\n${title}`);
const step = (msg: string) => console.log(`  ${msg}`);

async function main() {
  console.log("=== Continuum — NFT public-state migration (E2E) ===");
  console.log(`Node:    ${NODE_URL}`);
  console.log(`API:     ${API_URL}`);
  console.log(`Network: ${NETWORK}`);

  const api = new ContinuumApi();
  const { artifact, raw } = loadNftArtifact();

  const node = createAztecNodeClient(NODE_URL);
  await node.getNodeInfo();
  const wallet = await EmbeddedWallet.create(node, {
    ephemeral: true,
    pxeConfig: { proverEnabled: isRemote },
  });

  const { oldAddr, newAddr } = await resolveAccounts(wallet, node);

  // ════════════════════════════ OLD ROLLUP ═════════════════════════════════

  // Record the block before deploying so the indexer can start from here.
  const startBlock = await node.getBlockNumber();

  section("[OLD] deploying old NFT collection (migration disabled)...");
  const oldNft = await deployCollection(wallet, artifact, {
    name: "Continuum Old",
    symbol: "COLD",
    minter: oldAddr,
    attester: { x: Fr.ZERO, y: Fr.ZERO },
    from: oldAddr,
  });
  step(`✓ old collection: ${oldNft.address.toString()}`);

  section("[OLD] registering NFT artifact with the indexer...");
  const upload = await api.uploadArtifact({
    artifactId: "nft",
    name: "NFT",
    abi: raw,
    eventTypes: ["Transfer", "MigrationRegistered"],
    startBlock: { [NETWORK]: startBlock },
  });
  step(
    upload === "registered"
      ? `✓ artifact 'nft' registered (start_block.${NETWORK}=${startBlock})`
      : "✓ artifact 'nft' already registered (reusing existing sync state)",
  );

  section("[OLD] minting public NFTs...");
  for (const tokenId of ALICE_TOKENS) {
    await mintPublic(oldNft, oldAddr, tokenId, oldAddr);
    step(`✓ minted #${tokenId} → Alice-OLD`);
  }
  await mintPublic(oldNft, await AztecAddress.random(), OTHER_TOKEN, oldAddr);
  step(`✓ minted #${OTHER_TOKEN} → someone else (must be excluded)`);

  section("[OLD] fetching a fresh migration secret...");
  const { secret, commitment } = await api.newMigrationSecret();
  step(`secret:     ${secret.slice(0, 18)}… (saved by the user)`);
  step(`commitment: ${commitment.slice(0, 18)}…`);

  section("[OLD] Alice-OLD calls register_migration(commitment)...");
  await registerMigration(oldNft, commitment, oldAddr);
  step("✓ MigrationRegistered emitted (owner = Alice-OLD, authenticated)");

  // ════════════════════════════ NEW ROLLUP ═════════════════════════════════

  section("[NEW] fetching attester public key...");
  const attester = await api.getAttester();
  step(`pubkey.x: ${attester.x.slice(0, 18)}…`);

  section("[NEW] deploying new NFT collection (migration enabled)...");
  const newNft = await deployCollection(wallet, artifact, {
    name: "Continuum New",
    symbol: "CNEW",
    minter: oldAddr, // irrelevant for migration
    attester: { x: Fr.fromString(attester.x), y: Fr.fromString(attester.y) },
    from: oldAddr,
  });
  step(`✓ new collection: ${newNft.address.toString()}`);

  section("[NEW] registering old → new collection mapping...");
  await api.registerCollection({
    oldAddress: oldNft.address.toString(),
    newAddress: newNft.address.toString(),
    network: NETWORK,
    name: "Continuum E2E",
    artifactId: "nft",
  });
  step("✓ mapping registered");

  // ══════════════════════════════ CLAIM ════════════════════════════════════

  section("[CLAIM] polling /request_data until the indexer catches up...");
  const tokens = await api.pollRequestData(
    {
      collectionAddress: newNft.address.toString(),
      migrationSecret: secret,
      newWalletAddress: newAddr.toString(),
    },
    {
      expected: ALICE_TOKENS.length,
      onWait: (attempt, got) => step(`attempt ${attempt}: ${got}/${ALICE_TOKENS.length} tokens indexed…`),
    },
  );
  step(`✓ got ${tokens.length} signed token(s)`);
  assertExpectedTokens(tokens);

  section("[CLAIM] Alice-NEW migrate_and_claim() for each token...");
  for (const token of tokens) {
    await migrateAndClaim(newNft, token.token_id, token.signature_bytes, newAddr);
    step(`✓ claimed #${BigInt(token.token_id)}`);
  }

  // ═════════════════════════════ VERIFY ════════════════════════════════════

  await verifyClaims(newNft, newAddr, tokens);

  console.log("\n=== E2E migration complete ✅ ===");
  console.log(`  Old collection: ${oldNft.address.toString()}`);
  console.log(`  New collection: ${newNft.address.toString()}`);
  console.log(`  Migrated tokens: [${ALICE_TOKENS.join(", ")}]  Alice-OLD → Alice-NEW`);
}

main().catch((err) => {
  console.error("\nE2E migration failed:", err);
  process.exit(1);
});
