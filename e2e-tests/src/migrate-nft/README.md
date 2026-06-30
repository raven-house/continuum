# migrate-nft — NFT public-state migration (end to end)

This script proves the whole Continuum migration works for **publicly-owned NFTs**:
a user owned some NFTs on an old rollup, lost access to that wallet, and claims
them on a new rollup with a fresh wallet — without anyone being able to fake it.

It runs the **real** stack: an Aztec node + MongoDB + the indexer + the Continuum
API. Nothing is mocked.

---

## The story (what the script does)

It plays two characters: **Alice-OLD** (her old wallet) and **Alice-NEW** (her new one).

```
OLD ROLLUP
  1. Deploy an "old" NFT collection.
  2. Mint NFTs #101, #102 to Alice-OLD  (and #999 to a stranger).
  3. Ask the API for a one-time { secret, commitment }.
  4. Alice-OLD calls register_migration(commitment) on-chain.
        ↳ the contract records owner = msg_sender, so it can't be faked.

NEW ROLLUP
  5. Deploy a "new" NFT collection with the attester's public key baked in.
  6. Tell the API how the old and new collection map to each other.

CLAIM
  7. Reveal the secret to the API → it returns a signature per NFT Alice owns.
        ↳ #101 and #102 are returned; #999 (the stranger's) is correctly skipped.
  8. Alice-NEW calls migrate_and_claim(token, signature) for each.

VERIFY
  9. The NFTs now exist as Alice-NEW's private notes, and claiming twice is rejected.
```

If it finishes with `=== E2E migration complete ✅ ===`, everything worked.

---

## How to run it

You need **MongoDB + the indexer + the API** running first (see
`continuum/Makefile` / `docker-compose.yml`), and the indexer must be
watching the **same network** you point the script at.

### Sandbox (fast — recommended for iterating)

No L1 key, no waiting. Start a local sandbox, then:

```bash
# one-time: start the sandbox (gives you pre-funded test accounts)
aztec start --local-network            # → http://localhost:8080

# make sure the indexer is on sandbox:
#   CONTINUUM_INDEXER_NETWORKS=sandbox
#   CONTINUUM_AZTEC_NODE_URL_SANDBOX=http://host.docker.internal:8080   (it runs in Docker)

cd continuum/e2e-tests
AZTEC_NODE_URL=http://localhost:8080 CONTINUUM_NETWORK=sandbox bun run migrate-nft
```

On sandbox the script reuses the two pre-funded genesis accounts, so it takes ~1 minute.

### Testnet (slow — the real thing)

Each account bridges fee juice from L1 Sepolia and every tx is really proven, so
a full run takes several minutes.

```bash
# indexer on testnet:
#   CONTINUUM_INDEXER_NETWORKS=testnet
#   CONTINUUM_AZTEC_NODE_URL_TESTNET=https://v5.testnet.rpc.aztec-labs.com

cd continuum/e2e-tests
L1_PRIVATE_KEY=0x<sepolia-funded-key> bun run migrate-nft
```

(Defaults are already testnet, so you only add the L1 key. Reuse
`OLD_SECRET/OLD_SALT` + `NEW_SECRET/NEW_SALT` across runs to skip re-bridging.)

---

## Environment variables

| Var | Default | What it's for |
|---|---|---|
| `AZTEC_NODE_URL` | `https://v5.testnet.rpc.aztec-labs.com` | Which Aztec node to talk to |
| `CONTINUUM_API_URL` | `http://localhost:3004` | Continuum API base URL |
| `CONTINUUM_NETWORK` | `testnet` | Network label for the indexer/registry |
| `L1_PRIVATE_KEY` | — | Sepolia-funded key (testnet only, for fee-juice bridging) |
| `FEE_JUICE_AMOUNT` | `10^22` | Fee juice bridged per account (testnet). Raise it if a run hits "Not enough balance" |
| `OLD_SECRET` / `OLD_SALT` | random | Reuse a funded Alice-OLD account (testnet) |
| `NEW_SECRET` / `NEW_SALT` | random | Reuse a funded Alice-NEW account (testnet) |

---

## The files

Each file does one job; `index.ts` ties them together and is the place to read first.

| File | What's in it |
|---|---|
| `index.ts` | The orchestrator — the OLD → NEW → CLAIM → VERIFY story above |
| `config.ts` | Env vars, constants (tokens, timeouts), artifact path |
| `continuum-api.ts` | Typed client for the Continuum API (`/attester`, `/migration/new-secret`, `/contracts/upload`, `/collections/register`, `/request_data`) |
| `accounts.ts` | Sets up the two wallets — genesis accounts on sandbox, bridged accounts on testnet |
| `nft.ts` | Loads the NFT artifact and wraps the contract calls (deploy, mint, register, claim, reads) |
| `verify.ts` | Checks the right tokens were attested and the claim landed correctly |

---

## Common hiccups

- **`/request_data` keeps returning 404 / "not ready".** The indexer hasn't
  ingested your events yet. Check it's running, on the right network, and pointed
  at the right node URL (`host.docker.internal:8080` for sandbox in Docker).
  On testnet it may scan many empty blocks first — see the `start_block` note in
  the top-level docs.
- **`Not enough balance for fee payer to pay for transaction` (testnet).** The
  bridged fee juice ran out — testnet gas prices vary. Bridge more with
  `FEE_JUICE_AMOUNT=50000000000000000000000 bun run migrate-nft`, or reuse already-funded
  accounts via `OLD_SECRET/OLD_SALT` + `NEW_SECRET/NEW_SALT` to avoid re-bridging.
- **`Cannot satisfy constraint … signature[32 + i]`.** The deployed contract's
  signature scheme doesn't match the attester. Recompile `contracts/nft_contract`
  with the current toolchain and redeploy (the script deploys fresh each run).
- **A trailing `Could not find function artifact … when enriching error callstack`
  WARN at the very end** is harmless — it's just the SDK decorating the *expected*
  double-claim revert.
