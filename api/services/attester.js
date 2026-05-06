/**
 * Continuum Attester Service
 *
 * Signs migration claims with a Schnorr key over the Grumpkin curve.
 * The signature can be verified on-chain by the NFT contract's migrate_and_claim().
 *
 * Requires in package.json:
 *   "@aztec/bb.js":      "1.1.2"   (top-level, WASM-only — no native binary needed)
 *   "@aztec/foundation": "4.2.0"
 *   "@aztec/stdlib":     "4.2.0"
 *
 * Env vars:
 *   ATTESTER_SECRET  — 32-byte hex Schnorr secret key
 */

import { Barretenberg } from '@aztec/bb.js';
import { Fr } from '@aztec/foundation/curves/bn254';
import { Schnorr } from '@aztec/foundation/crypto/schnorr';
import { deriveSigningKey } from '@aztec/stdlib/keys';

// DOM_SEP__AUTHWIT_INNER from aztec-packages/v4.2.0 constants.nr line ~180
// Equivalent to computeInnerAuthWitHash(fields) = Poseidon2([DOM_SEP, ...fields])
const DOM_SEP_AUTHWIT_INNER = 221354163n;

// "NFTM" — must match MIGRATE_DOMAIN in nft_contract/src/main.nr
const MIGRATE_DOMAIN = Fr.fromString('0x4e46544d');

let _cached = null;

async function getAttester() {
  if (_cached) return _cached;

  const secretHex = process.env.ATTESTER_SECRET;
  if (!secretHex) {
    throw new Error(
      'ATTESTER_SECRET env var is required for attestation signing'
    );
  }

  const secretKey = Fr.fromHexString(secretHex);
  const signingKey = deriveSigningKey(secretKey);
  const schnorr = new Schnorr();
  const rawPubKey = await schnorr.computePublicKey(signingKey);

  _cached = {
    signingKey,
    schnorr,
    publicKey: {
      x: rawPubKey.x.toString(),
      y: rawPubKey.y.toString()
    }
  };

  return _cached;
}

/**
 * Sign a migration claim for a single NFT token.
 *
 * Signed fields (order matters — must match Noir contract):
 *   [ MIGRATE_DOMAIN, collection_address, new_wallet_address, token_id ]
 *
 * @param {string} collectionAddress  - New rollup NFT contract address (0x-prefixed hex)
 * @param {string} newWalletAddress   - Claimer's address on the new rollup (0x-prefixed hex)
 * @param {string|bigint} tokenId     - Token ID to migrate
 * @returns {{ signature: string, signatureBytes: number[] }}
 */
export async function signMigrationClaim(
  collectionAddress,
  newWalletAddress,
  tokenId
) {
  const { signingKey, schnorr } = await getAttester();

  const fields = [
    MIGRATE_DOMAIN,
    Fr.fromHexString(collectionAddress),
    Fr.fromHexString(newWalletAddress),
    new Fr(BigInt(tokenId))
  ];

  // Compute Poseidon2([DOM_SEP_AUTHWIT_INNER, ...fields]) using the top-level
  // @aztec/bb.js@1.1.2 (WASM-only). This avoids the nested @aztec/foundation
  // bb.js@4.2.0 which tries to spawn a native binary not present on the server.
  const bb = await Barretenberg.new();
  let hashBuffer;
  try {
    const hashBigInt = await bb.poseidon2Hash([
      DOM_SEP_AUTHWIT_INNER,
      ...fields.map(f => f.toBigInt())
    ]);
    const hashHex = hashBigInt.toString(16).padStart(64, '0');
    hashBuffer = Buffer.from(hashHex, 'hex');
  } finally {
    await bb.destroy();
  }

  const sig = await schnorr.constructSignature(hashBuffer, signingKey);
  const sigBuffer = Buffer.from(sig.toBuffer());
  const sigHex = `0x${sigBuffer.toString('hex')}`;

  const signatureBytes = [];
  for (let i = 0; i < sigBuffer.length; i++) {
    signatureBytes.push(sigBuffer[i]);
  }

  return { signature: sigHex, signatureBytes };
}

/**
 * Get the attester's public key coordinates (for display / documentation).
 * These are what collection owners embed in their NFT contract constructor.
 *
 * @returns {{ x: string, y: string }}
 */
export async function getAttesterPublicKey() {
  const { publicKey } = await getAttester();
  return publicKey;
}
