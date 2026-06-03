# How Continuum Works — Aztec State Migration with Schnorr Attestation

Continuum solves one of the hardest problems in rollup development: **how do users carry their state forward when a rollup upgrades or migrates?**

When an Aztec L2 rollup migrates to a new version, all on-chain state is reset. Users who held NFTs, tokens, or other assets on the old rollup need a way to prove those holdings and recreate them on the new rollup — without trusting any single party and without requiring access to the old rollup's private data.

Continuum provides a **cryptographic bridge** between old and new rollup state using:
1. An **event indexer** that reads public events from the old rollup
2. An **attester service** that signs user state claims with a Schnorr key
3. A **Noir smart contract** on the new rollup that verifies those signatures and records the migration

---

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     OLD ROLLUP (deprecated)                  │
│                                                              │
│   NFT Contract ──► public events (transfers, mints, etc.)   │
└───────────────────────────┬─────────────────────────────────┘
                            │ Continuum indexes events
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                     CONTINUUM SERVICE                         │
│                                                              │
│  ┌─────────────────┐    ┌─────────────────────────────────┐ │
│  │ Event Indexer   │───►│ MongoDB (per-user state)        │ │
│  │ (cron, 25s)     │    └─────────────────────────────────┘ │
│  └─────────────────┘                    │                   │
│                                         ▼                   │
│  ┌─────────────────┐    ┌─────────────────────────────────┐ │
│  │ Attester        │    │ REST API                        │ │
│  │ (Schnorr keys)  │◄───│ GET /state/:address             │ │
│  └────────┬────────┘    └─────────────────────────────────┘ │
│           │ signs claim                                      │
└───────────┼─────────────────────────────────────────────────┘
            │ { amount, signature }
            ▼
┌─────────────────────────────────────────────────────────────┐
│                     NEW ROLLUP (current)                     │
│                                                              │
│   MigrationClaims contract                                   │
│   ├─ verifies Schnorr signature (private context)           │
│   ├─ records claimed amount per user                        │
│   ├─ prevents double-claiming                               │
│   └─ emits MigrationClaimed event (for Continuum to index)  │
└─────────────────────────────────────────────────────────────┘
```

---

## How the Attestation Works

### The Cryptographic Primitives

Continuum uses **Schnorr signatures over the Grumpkin curve** — the same elliptic curve that Aztec uses internally for account keys. This is a natural fit because:

- Aztec's private VM (not the AVM) supports Grumpkin Schnorr natively
- The `schnorr` Noir library provides `assert_valid_signature`
- Hashing is done with **Poseidon2**, which is cheap inside ZK circuits

### Off-Chain: Signing a Claim

The attester holds a secret key (`ATTESTER_SECRET`) and its derived Grumpkin public key (`ATTESTER_PUBKEY_X/Y`). To attest that address `U` may claim `N` units on contract `C`:

```
hash = Poseidon2([ CLAIM_DOMAIN, C, U, N ])
signature = Schnorr.sign(hash, attester_secret_key)
```

`CLAIM_DOMAIN = 0x434c4d` ("CLM") is a domain separator that prevents signature reuse across different contract methods.

In TypeScript (`simple-attestor/src/index.ts`):
```typescript
const attester = await Attester.create(ATTESTER_SECRET);
const fields = [CLAIM_DOMAIN, contractAddress.toField(), userAddress.toField(), amount];
const { signature } = await attester.attest(fields);  // Poseidon2 hash + Schnorr sign
```

### On-Chain: Verifying the Claim

The `MigrationClaims` contract stores the attester's public key immutably at deployment. When a user calls `claim(amount, signature)`:

1. **Private context** — Schnorr verification runs inside the private VM (the AVM does not support Blake2s, which Schnorr requires internally)
2. The contract reconstructs the expected fields: `[CLAIM_DOMAIN, contract_addr, msg_sender, amount]`
3. Calls `assert_valid_attestation(pubkey, signature, fields)` from `attestation_lib`
4. If valid, enqueues an internal public call: `_record_claim_internal(caller, amount)`
5. The public call checks no prior claim exists, writes the amount, increments total, emits event

```
          User Browser / CLI
                │
    claim(amount=10, sig=0x...)
                │
    ┌───────────▼──────────────────────────────────────────┐
    │ [PRIVATE CONTEXT] claim()                            │
    │  1. Read attester pubkey from PublicImmutable        │
    │  2. Build fields = [CLM_DOMAIN, contract, user, 10]  │
    │  3. assert_valid_attestation(pubkey, sig, fields) ✓  │
    │  4. enqueue_self._record_claim_internal(user, 10)    │
    └──────────────────────┬───────────────────────────────┘
                           │ enqueued
    ┌──────────────────────▼───────────────────────────────┐
    │ [PUBLIC CONTEXT] _record_claim_internal()            │
    │  1. assert claimed[user] == 0  (no double-claim)     │
    │  2. claimed[user] = 10                               │
    │  3. total_claimed += 10                              │
    │  4. emit MigrationClaimed { user, amount: 10 }       │
    └──────────────────────────────────────────────────────┘
```

### Why Private Context for Verification?

Schnorr signature verification uses Blake2s internally, which is **not available in the AVM** (Aztec Virtual Machine used for public functions). It is available in the private VM. That's why `claim()` is a private function even though it only updates public state — the signature check happens in private, then the state update is enqueued as a public call.

---

## The Attester Library

Two components implement the attestation protocol, one on each side of the boundary:

### `attestor-contracts/attestation_lib/` (Noir)

```noir
pub fn assert_valid_attestation<let N: u32>(
    pubkey: EmbeddedCurvePoint,
    signature: [u8; 64],
    fields: [Field; N],
) {
    let hash = compute_inner_authwit_hash(fields);  // Poseidon2
    schnorr::assert_valid_signature(pubkey, signature, hash.to_be_bytes::<32>());
}
```

### `simple-attestor/src/index.ts` (TypeScript)

```typescript
export class Attester {
  async attest(fields: Fr[]): Promise<Attestation> {
    const hash = await computeInnerAuthWitHash(fields);  // same Poseidon2
    const sig = await this.schnorr.constructSignature(hash.toBuffer(), this.signingKey);
    return { hash, signature: `0x${Buffer.from(sig.toBuffer()).toString("hex")}` };
  }
}
```

Both sides use `computeInnerAuthWitHash` (Poseidon2) and Schnorr over Grumpkin — they are symmetric by design.

---

## Security Properties

### Domain Separation
Every contract method that uses attestations has its own domain constant (`CLAIM_DOMAIN = 0x434c4d`). A valid signature for `claim()` cannot be replayed against a different method, even on the same contract.

### Caller Binding
The user's address (`msg_sender()`) is included in the signed fields. A signature issued to address `A` is cryptographically invalid when submitted by address `B`. The attester decides who gets to claim and for how much.

### No Double-Claiming
The contract's `_record_claim_internal` asserts `claimed[user] == 0` before writing. A second claim from the same address always reverts, regardless of signature validity.

### On-Curve Public Key Validation
The constructor validates that the attester's public key lies on the Grumpkin curve (`y² = x³ − 17`) before storing it. A malformed key would make all future attestations unverifiable.

---

## Repository Structure

```
continuum/
├── attestor-contracts/
│   ├── attestation_lib/      # Noir: Schnorr verification library (reusable)
│   │   └── src/lib.nr
│   ├── example/              # Noir: simple counter demo (already deployed)
│   │   └── src/main.nr
│   └── migration_contract/   # Noir: per-user migration registry (this MVP)
│       └── src/main.nr
│
├── simple-attestor/          # TypeScript: attester + deploy/claim scripts
│   └── src/
│       ├── index.ts               # Attester class + signatureToBytes
│       ├── bridge-fee-juice.ts    # L1→L2 fee juice bridging
│       ├── deploy-example.ts      # Deploy the example counter contract
│       ├── deploy-migration.ts    # Deploy MigrationClaims
│       └── claim-migration.ts     # Create attestation + call claim()
│
├── indexer/                  # Event indexer (scheduler, reads old rollup)
├── api/                      # Fastify REST API
└── database/                 # MongoDB init scripts
```

---

## Running the Demo

### Prerequisites

- `aztec` CLI installed (for compiling Noir contracts via `aztec compile`)
- `bun` installed
- A Sepolia-funded Ethereum private key (for testnet fee juice bridging)
- Access to the Aztec testnet: `https://rpc.testnet.aztec-labs.com`

### Step 1 — Compile the Migration Contract

```bash
cd attestor-contracts/migration_contract
aztec compile
# Output: target/migration_contract-MigrationClaims.json
```

### Step 2 — Deploy

```bash
cd simple-attestor
bun install

# Testnet
L1_PRIVATE_KEY=0x<your-sepolia-key> bun run deploy-migration

# Sandbox (no fee juice needed)
AZTEC_NODE_URL=http://localhost:8080 bun run deploy-migration
```

Copy the printed values into your `.env`:

```
MIGRATION_CONTRACT_ADDRESS=0x...
ATTESTER_SECRET=0x...
ATTESTER_PUBKEY_X=0x...
ATTESTER_PUBKEY_Y=0x...
DEPLOYER_SECRET=0x...
DEPLOYER_SALT=0x...
```

### Step 3 — Claim

```bash
# Testnet
MIGRATION_CONTRACT_ADDRESS=0x... \
ATTESTER_SECRET=0x... \
DEPLOYER_SECRET=0x... \
DEPLOYER_SALT=0x... \
CLAIM_AMOUNT=42 \
bun run claim-migration

# Sandbox
AZTEC_NODE_URL=http://localhost:8080 \
MIGRATION_CONTRACT_ADDRESS=0x... \
# ... rest of vars
bun run claim-migration
```

Expected output:
```
=== MigrationClaims — Claim Demo ===
1. Connecting to Aztec node...   ✓ Connected
2. Reconstructing deployer wallet...   ✓ User address: 0x...
3. Loading MigrationClaims artifact...   ✓ Contract loaded
4. Attester signing claim for 42 units...   ✓ Signed
5. Submitting claim(amount=42, signature) to contract...   ✓ Claim accepted!
6. Reading post-claim state...
   claimed_amount for 0x...: 42
   total_claimed (all users): 42
   has_claimed: true
7. Testing double-claim prevention...
   ✓ Second claim correctly rejected: already claimed
```

---

## Full Migration Flow (Production Vision)

In the complete system, the attester is not the same wallet as the user. The flow is:

```
User (address U) ──► Continuum API: "what can I claim?"
                           │
                           ▼
                  Query indexed events for address U
                  → Found: 5 NFTs on old rollup
                           │
                           ▼
                  Attester signs: [CLM_DOMAIN, contract, U, 5]
                  → Returns { amount: 5, signature: 0x... }
                           │
                           ▼
User submits claim(amount=5, signature) to MigrationClaims
                           │
                           ▼
Contract verifies → user gets 5 units on new rollup ✓
```

The key insight: **the attester doesn't need to trust the user, and the user doesn't need to trust the attester's database** — the Schnorr signature binds the claim to a specific address and amount, and the Noir contract enforces that binding on-chain.

---

## Extending This Pattern

The `attestation_lib` is generic. The same `assert_valid_attestation` call can be used for any use case where a trusted off-chain service needs to gate on-chain state updates:

- NFT migrations with metadata preservation
- Token balance migrations
- Access control lists signed by an operator
- Oracle-gated contract interactions

The only contract-specific logic is:
1. What fields you include in the signed payload (domain + relevant data)
2. What state you update if the signature is valid

---

## Aztec Version

All Noir contracts target `aztec = v4.2.0-aztecnr-rc.2`. TypeScript packages use `@aztec/aztec.js@4.2.0-aztecnr-rc.2`.
