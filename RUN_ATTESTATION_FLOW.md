# Running the Attestation Flow (Aztec 4.3.0)

Step-by-step guide to compile the Noir contract and run the **off-chain attestation → on-chain claim** demo end to end, so you can confirm the Schnorr attestation flow works.

This exercises the same primitive the production NFT migration uses:

```
Attester (off-chain)  ──Poseidon2 + Schnorr sign──►  signature
        │                                                 │
        ▼                                                 ▼
   MigrationClaims contract  ──verify sig in PRIVATE ctx──►  record claim (public)
```

The runnable contract is `attestor-contracts/migration_contract` (`MigrationClaims`). The scripts live in `simple-attestor/`.

---

## 0. Prerequisites

| Tool | Version | Check |
|---|---|---|
| `aztec` CLI | `4.3.0` | `aztec --version` |
| `bun` | ≥ 1.3 | `bun --version` |
| A Sepolia-funded ETH private key | — | needed only for **testnet** (fee-juice bridging) |

You also need access to an Aztec node:
- **Testnet** (default): `https://rpc.testnet.aztec-labs.com`
- **Sandbox** (local, no L1 key): `aztec start --local-network` → `http://localhost:8080`

> The CLI/toolchain must be `4.3.0`. If not: `aztec-up 4.3.0`.

---

## 1. Compile the contract

```bash
cd attestor-contracts/migration_contract
rm -f Nargo.lock          # force re-fetch of the v4.3.0 deps (first time / after a bump)
aztec compile
```

Expected: `Compilation complete!` and the artifact at:

```
target/migration_contract-MigrationClaims.json
```

`aztec compile` runs `nargo compile` **and** the AVM transpile + verification-key generation — use it, not `aztec-nargo compile`.

---

## 2. Install script dependencies

```bash
cd ../../simple-attestor
bun install
```

All `@aztec/*` packages resolve to `4.3.0`.

---

## 3. Configure `.env`

Create / edit `simple-attestor/.env`:

### Testnet
```bash
AZTEC_NODE_URL=https://rpc.testnet.aztec-labs.com
L1_PRIVATE_KEY=0x<your-sepolia-funded-private-key>
# Optional — if omitted, deploy generates random ones and prints them:
# ATTESTER_SECRET=0x...
# DEPLOYER_SECRET=0x...
# DEPLOYER_SALT=0x...
```

### Sandbox (local — no L1 key, no real proving wait)
```bash
AZTEC_NODE_URL=http://localhost:8080
```

`bun` auto-loads `.env` from the working directory.

---

## 4. Deploy `MigrationClaims`

```bash
cd simple-attestor
bun run deploy-migration
```

What it does:
1. Connects to the node.
2. Reconstructs (or creates) the deployer Schnorr account from `DEPLOYER_SECRET`/`DEPLOYER_SALT`.
3. **Testnet only:** if the account has no L2 fee juice, bridges it from L1 Sepolia (this includes an "⏳ Waiting for L1→L2 message…" loop that can take a few minutes).
4. Deploys `MigrationClaims` with the attester's Grumpkin public key baked in.

At the end it prints a block to copy — **save these**, you need them for the claim:

```
MIGRATION_CONTRACT_ADDRESS=0x...
CONTRACT_SALT=0x...
ATTESTER_SECRET=0x...
ATTESTER_PUBKEY_X=0x...
ATTESTER_PUBKEY_Y=0x...
DEPLOYER_SECRET=0x...
DEPLOYER_SALT=0x...
```

> Paste all seven lines into `simple-attestor/.env` (replacing any older values). The claim script reads them from `.env`.
>
> ⚠️ Each `aztec compile` changes the contract class, and `deploy-migration` uses a fresh random `CONTRACT_SALT` every run — so always run a **new deploy** and use **that run's** `MIGRATION_CONTRACT_ADDRESS` + `CONTRACT_SALT`. An old address will not match a freshly compiled artifact.

Testnet deploy takes ~3–5 min (fee-juice wait + proof generation). Sandbox is much faster.

---

## 5. Run the claim

With the seven values in `.env`:

```bash
cd simple-attestor
CLAIM_AMOUNT=42 bun run claim-migration
```

(or just `bun run claim-migration` to use the default amount of 10)

What it does:
1. Reconstructs the user (= deployer) wallet and registers the contract with the PXE.
2. The **attester signs** `Poseidon2([CLAIM_DOMAIN, contract_addr, user_addr, amount])`.
3. Submits `claim(amount, signature)` — the **Schnorr signature is verified inside the private context**, then the amount is recorded via an enqueued public call.
4. Reads back the resulting state.
5. Tries a second claim to prove double-claim protection.

---

## 6. How to know it worked ✅

Successful output ends with:

```
5. Submitting claim(amount=42, signature) to contract...
   ✓ Claim accepted! Tx hash: 0x...
6. Reading post-claim state...
   claimed_amount for 0x...: 42
   total_claimed (all users): 42
   has_claimed: true
7. Testing double-claim prevention...
   ✓ Second claim correctly rejected: already claimed

=== Demo Complete ===
```

The attestation flow is working if **all** of these hold:
- `Claim accepted!` with a tx hash (the on-chain Schnorr verification passed)
- `claimed_amount` == your `CLAIM_AMOUNT`
- `has_claimed: true`
- the second claim is **rejected** (`already claimed`)

A trailing `WARN ... Could not find function artifact ... when enriching error callstack` after the rejection is harmless — it's just decorating the *expected* revert.

---

## Run it again as a "new user"

A given wallet can only claim once. To re-test, deploy a fresh contract (new `CONTRACT_SALT`) **or** use a different `DEPLOYER_SECRET`/`DEPLOYER_SALT` so the claimer address changes, then repeat steps 4–5.

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `no such field is_infinite` on compile | Old `schnorr` tag — ensure `attestor-contracts/attestation_lib/Nargo.toml` uses `schnorr v0.2.0` and the contract source uses `EmbeddedCurvePoint { x, y }` (no `is_infinite`). |
| Compile errors after a version bump | `rm -f Nargo.lock` and recompile so new git tags are fetched. |
| `Missing required env var: MIGRATION_CONTRACT_ADDRESS` | You didn't paste the deploy output into `.env` (step 4). |
| Claim reverts / `unable to find contract` | The `.env` `MIGRATION_CONTRACT_ADDRESS`/`CONTRACT_SALT` are from an older deploy or a different artifact. Re-deploy and use the new values. |
| `Bridging fee juice…` hangs on testnet | L1→L2 messages take a few minutes; it retries up to 40×. Ensure `L1_PRIVATE_KEY` is Sepolia-funded. |
| Want to skip L1 entirely | Use the **sandbox**: `aztec start --local-network`, set `AZTEC_NODE_URL=http://localhost:8080`. |

---

## What this proves vs. the full product

This demo signs a single scalar `amount`. The production NFT migration (`request_data` API + `migrate_and_claim` on the `nft_contract`, which lives in `raven-house-app`) uses the **same** `attestation_lib` primitive but signs `[MIGRATE_DOMAIN, collection, new_wallet, token_id]` per token. If this demo passes, the attestation library and the off-chain↔on-chain hashing agreement (Poseidon2 `compute_inner_authwit_hash` + Schnorr over Grumpkin) are working on 4.3.0.
