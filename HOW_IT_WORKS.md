# How Continuum Works — Aztec State Migration with Schnorr Attestation

Continuum solves one of the hardest problems in rollup development: **how do users carry their state forward when a rollup upgrades or migrates?**

When an Aztec L2 rollup migrates to a new version, all on-chain state is reset. Users who held NFTs, tokens, or other assets on the old rollup need a way to prove those holdings and recreate them on the new rollup — without trusting any single party and without requiring access to the old rollup's private data.

Continuum provides a **cryptographic bridge** between old and new rollup state using:

1. An **event indexer** that reads public events from the old rollup
2. A **REST API** that computes user balances and signs attestation claims with a Schnorr key
3. A **Noir smart contract** on the new rollup that verifies those signatures and records the migration

---

## Full System Diagram

```
+------------------------------------------------------------------+
|                    OLD ROLLUP (deprecated)                        |
|                                                                    |
|   NFT Contract --> public NFTTransfer events                      |
|                    (from, to, token_id per block)                 |
+-------------------------------+----------------------------------+
                                |
                    Continuum indexes events every 25s
                                |
                                v
+------------------------------------------------------------------+
|                     CONTINUUM SERVICE (Docker)                    |
|                                                                    |
|  +-------------------+     +----------------------------------+   |
|  | Event Indexer     |---> | MongoDB: events collection       |   |
|  | (cron, every 25s) |     | { artifact_id, event_type,       |   |
|  |                   |     |   block_number, data.from,       |   |
|  | Reads: Aztec node |     |   data.to, data.token_id }       |   |
|  | Writes: MongoDB   |     +------------------+---------------+   |
|  +-------------------+                        |                   |
|                                               v                   |
|  +-------------------+     +----------------------------------+   |
|  | Schnorr Attester  |<--- | REST API: Fastify                |   |
|  | (ATTESTER_SECRET) |     | GET /migration/attestation       |   |
|  |                   |     |   ?address=0x...&contract=0x...  |   |
|  | Signs:            |     |                                  |   |
|  |  Poseidon2(       |     | 1. Count received NFTs           |   |
|  |   [CLM, C, U, N] |     | 2. Subtract sent NFTs            |   |
|  |  )                |     | 3. Sign balance with Schnorr     |   |
|  +--------+----------+     | 4. Return { amount, sigBytes }   |   |
|           |                +----------------------------------+   |
+-----------+------------------------------------------------------+
            |
            | { amount, signature, sigBytes }
            v
+------------------------------------------------------------------+
|                     NEW ROLLUP (current Aztec testnet)           |
|                                                                    |
|   MigrationClaims contract (Noir)                                |
|   +- verifies Schnorr signature in private context              |
|   +- asserts claim[user] == 0  (prevents double-claiming)       |
|   +- records claimed_amount[user] = N                           |
|   +- increments total_claimed                                   |
|   +- emits MigrationClaimed { user, amount }                    |
+------------------------------------------------------------------+
```

---

## Step-by-Step Demo Flow

### Terminal 1 — Start the Docker Stack

```bash
cd continuum
docker compose -f docker-compose.local.yml up
```

This starts:
- **MongoDB** — stores indexed events
- **Event Indexer** — polls Aztec testnet every 25s, decodes NFTTransfer events, stores in MongoDB
- **REST API** — Fastify server on port 3004

### Terminal 2 — Seed "Old Rollup" State

```bash
DEMO_ADDRESS=0x27b6f... bun run demo/seed-demo-events.js
```

Inserts 3 NFTTransfer mint events for the demo address in MongoDB. This simulates what the indexer would have stored from the old rollup (the address held 3 NFTs before the migration).

Output:
```
Seeded 3 new + 0 updated NFTTransfer events
Demo address: 0x27b6f...
Expected API response: { amount: 3, ... }
```

### Terminal 3 — Get Signed Attestation from API

```bash
curl "http://localhost:3004/migration/attestation?address=0x27b6f...&contract=0x0fa59..."
```

The API:
1. Queries MongoDB: counts NFTs received by address (3), subtracts NFTs sent away (0)
2. Signs `Poseidon2([CLM_DOMAIN, contract, address, 3])` with `ATTESTER_SECRET`
3. Returns the signed claim

Output:
```json
{
  "address": "0x27b6f...",
  "contractAddress": "0x0fa59...",
  "amount": 3,
  "signature": "0x...",
  "sigBytes": [12, 34, ...],
  "attestedAt": "2026-04-23T12:00:00.000Z"
}
```

### Terminal 4 — Submit Claim to the New Rollup

```bash
API_URL=http://localhost:3004 \
MIGRATION_CONTRACT_ADDRESS=0x0fa59... \
CONTRACT_SALT=0x... \
ATTESTER_PUBKEY_X=0x... \
ATTESTER_PUBKEY_Y=0x... \
DEPLOYER_SECRET=0x... \
DEPLOYER_SALT=0x... \
bun run claim-migration
```

The script:
1. Connects to the Aztec testnet, reconstructs the deployer wallet
2. Calls `GET /migration/attestation` — receives `{ amount: 3, sigBytes: [...] }`
3. Submits `claim(amount=3, signature)` to the MigrationClaims contract
4. Private proof is generated; Schnorr signature is verified inside the circuit
5. State is updated, `MigrationClaimed` event is emitted

Output:
```
=== MigrationClaims - Claim via Continuum API ===

1. Connecting to Aztec node... Connected
2. Reconstructing deployer wallet... User address: 0x27b6f...
3. Loading MigrationClaims artifact... Contract registered
4. Fetching attestation from Continuum API...
   GET http://localhost:3004/migration/attestation?address=0x27b6f...&contract=0x0fa59...
   Attestation received: amount=3, signature=0x1a2b3c...
5. Submitting claim(amount=3) to MigrationClaims contract...
   Claim accepted! Tx hash: 0x...
6. Reading post-claim state...
   claimed_amount for 0x27b6f...: 3
   total_claimed (all users): 3
   has_claimed: true
7. Testing double-claim prevention...
   Second claim correctly rejected: already claimed

=== Demo Complete ===
```

---

## How the NFT Balance is Computed

The indexer stores one document per decoded public event:

```json
{
  "artifact_id": "example-nft",
  "event_type": "NFTTransfer",
  "block_number": 1042,
  "contract_address": "0xabc...",
  "data": {
    "from": "0x0000...0000",
    "to": "0x27b6f...",
    "token_id": "0x0000...0001"
  },
  "timestamp": 1745000000
}
```

The attestation endpoint computes balance as:

```
received = count(event_type=NFTTransfer AND data.to=address)
sent     = count(event_type=NFTTransfer AND data.from=address)
balance  = received - sent
```

Mints have `data.from = 0x000...000` (zero address). A user who received 5 NFTs and sent 2 away would show `balance = 3`. This is the amount they can claim on the new rollup.

---

## How the Attestation Works

### Cryptographic Primitives

Continuum uses **Schnorr signatures over the Grumpkin curve** — the same elliptic curve that Aztec uses internally for account keys:

- The private VM supports Grumpkin Schnorr natively
- Hashing uses **Poseidon2**, which is efficient inside ZK circuits
- The on-chain Noir library `assert_valid_attestation` handles verification

### Off-Chain Signing (API)

```javascript
// api/lib/attester.js
const CLAIM_DOMAIN = new Fr(0x434c4d); // "CLM"

const fields = [CLAIM_DOMAIN, contractFr, userFr, amountFr];
const hash = await computeInnerAuthWitHash(fields);  // Poseidon2
const sig = await schnorr.constructSignature(hash.toBuffer(), signingKey);
```

`CLAIM_DOMAIN = 0x434c4d` ("CLM") is a domain separator that prevents a valid signature for `claim()` from being replayed against a different contract method.

### On-Chain Verification (Noir)

```noir
// attestor-contracts/migration_contract/src/main.nr
#[external("private")]
fn claim(amount: Field, signature: [u8; 64]) {
    let fields = [
        CLAIM_DOMAIN,
        self.context.this_address().to_field(),
        self.msg_sender().to_field(),
        amount,
    ];
    assert_valid_attestation(attester_pubkey, signature, fields);
    self.enqueue_self._record_claim_internal(caller, amount);
}
```

The contract reconstructs the same field array using on-chain data (contract address, msg_sender) so the user cannot forge a claim for a different address or amount.

### Why Private Context for Signature Verification?

Schnorr signature verification uses **Blake2s** internally. Blake2s is available in the **private VM** but **not in the AVM** (Aztec Virtual Machine used for public functions). That's why `claim()` is declared as a private function even though it only updates public state — the signature check runs privately, then the state update is enqueued as a public call via `enqueue_self._record_claim_internal(caller, amount)`.

---

## The Attestation Flow in Detail

```
User CLI
    |
    claim(amount=3, sig=0x...)
    |
+---v-----------------------------------------------------+
| [PRIVATE CONTEXT] claim()                               |
|  1. Read attester pubkey from PublicImmutable           |
|  2. Build fields = [CLM, contract_addr, msg_sender, 3]  |
|  3. assert_valid_attestation(pubkey, sig, fields)       |
|  4. enqueue_self._record_claim_internal(user, 3)        |
+-----------------------------------+---------------------+
                                    | enqueued
+-----------------------------------v---------------------+
| [PUBLIC CONTEXT] _record_claim_internal()               |
|  1. assert claimed[user] == 0  (no double-claim)        |
|  2. claimed[user] = 3                                   |
|  3. total_claimed += 3                                  |
|  4. emit MigrationClaimed { user, amount: 3 }           |
+---------------------------------------------------------+
```

---

## Security Properties

### Domain Separation

`CLAIM_DOMAIN = 0x434c4d` ("CLM") is included in every signed payload. A signature for `claim()` cannot be replayed against a different method on the same contract, or against a different contract that happens to use the same attester key.

### Caller Binding

The user's address (`msg_sender()`) is embedded in the signed fields. A signature issued to address `A` is cryptographically invalid when submitted by address `B`. The attester controls who gets to claim and for how much.

### No Double-Claiming

`_record_claim_internal` asserts `claimed[user] == 0` before writing. A second call from the same address always reverts, regardless of whether the signature is valid.

### On-Curve Public Key Validation

The constructor validates that the attester's public key lies on the Grumpkin curve (`y^2 = x^3 - 17`) before storing it. A malformed key would silently make all future attestations unverifiable — the constructor catches this at deployment time.

---

## Repository Structure

```
continuum/
+-- attestor-contracts/
|   +-- attestation_lib/      # Noir: Schnorr verification library (reusable)
|   |   +-- src/lib.nr        #   assert_valid_attestation()
|   +-- migration_contract/   # Noir: per-user migration registry
|   |   +-- src/main.nr       #   MigrationClaims contract
|   +-- example/              # Noir: simple counter demo
|
+-- simple-attestor/          # TypeScript: deploy + claim scripts
|   +-- src/
|       +-- index.ts               # Attester class (Schnorr signing)
|       +-- bridge-fee-juice.ts    # L1->L2 fee juice bridging
|       +-- deploy-migration.ts    # Deploy MigrationClaims
|       +-- claim-migration.ts     # Fetch attestation from API + submit claim
|
+-- api/                      # Fastify REST API
|   +-- lib/attester.js       # Schnorr signing (mirrors simple-attestor/src/index.ts)
|   +-- routes/migration/
|       +-- index.js          # Migration key routes (legacy)
|       +-- attestation.js    # GET /migration/attestation (new)
|
+-- functions/                # Event indexer (cron, reads Aztec testnet)
+-- database/                 # MongoDB init scripts
+-- demo/
    +-- seed-demo-events.js   # Seed test NFT events for demo
```

---

## Running the Full Demo

### Prerequisites

- Docker + Docker Compose
- `bun` installed
- `aztec` installed (for compiling Noir contracts)
- A Sepolia-funded Ethereum private key (for testnet fee juice bridging)

### Step 1 — Compile and Deploy the Migration Contract

```bash
# Compile
cd attestor-contracts/migration_contract
aztec compile
# Output: target/migration_contract-MigrationClaims.json

# Deploy (testnet)
cd ../../simple-attestor
L1_PRIVATE_KEY=0x<your-sepolia-key> bun run deploy-migration
```

Copy the printed env vars into `api/.env`:

```
MIGRATION_CONTRACT_ADDRESS=0x...
ATTESTER_SECRET=0x...
ATTESTER_PUBKEY_X=0x...
ATTESTER_PUBKEY_Y=0x...
DEPLOYER_SECRET=0x...
DEPLOYER_SALT=0x...
CONTRACT_SALT=0x...
```

### Step 2 — Start Docker Stack

```bash
docker compose -f docker-compose.local.yml up
```

### Step 3 — Seed Demo Events

```bash
DEMO_ADDRESS=<your-deployer-address> bun run demo/seed-demo-events.js
```

### Step 4 — Verify API Returns Attestation

```bash
curl "http://localhost:3004/migration/attestation?address=<DEMO_ADDRESS>&contract=<CONTRACT_ADDRESS>"
```

### Step 5 — Submit Claim on New Rollup

```bash
API_URL=http://localhost:3004 \
MIGRATION_CONTRACT_ADDRESS=0x... \
CONTRACT_SALT=0x... \
ATTESTER_PUBKEY_X=0x... \
ATTESTER_PUBKEY_Y=0x... \
DEPLOYER_SECRET=0x... \
DEPLOYER_SALT=0x... \
bun run claim-migration
```

---

## Extending This Pattern

The `attestation_lib` is generic — the same `assert_valid_attestation` call can gate any on-chain state update behind an off-chain attestation:

- NFT migrations with metadata preservation
- Token balance migrations between rollup versions
- Access control lists signed by an operator
- Oracle-gated contract interactions

The only contract-specific logic is:
1. What fields you include in the signed payload (domain + relevant data)
2. What state you update if the signature is valid

---

## Aztec Version

All Noir contracts target `aztec = v4.2.0-aztecnr-rc.2`. TypeScript and JavaScript packages use `@aztec/aztec.js@4.2.0-aztecnr-rc.2`, `@aztec/foundation@4.2.0-aztecnr-rc.2`, and `@aztec/stdlib@4.2.0-aztecnr-rc.2`.
