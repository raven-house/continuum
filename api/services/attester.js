/**
 * Continuum Attester Service
 *
 * Signs migration claims with a Schnorr key over the Grumpkin curve.
 * The signature can be verified on-chain by the NFT contract's migrate_and_claim().
 *
 * Requires in package.json:
 *   "@aztec/foundation": "4.3.0"
 *   "@aztec/stdlib":     "4.3.0"
 *
 * Env vars:
 *   ATTESTER_SECRET  — 32-byte hex Schnorr secret key
 */

import { Fr } from '@aztec/foundation/curves/bn254';
import { Schnorr } from '@aztec/foundation/crypto/schnorr';
import { deriveSigningKey } from '@aztec/stdlib/keys';
// Use the SYNC poseidon (WASM via BarretenbergSync). The async variant in
// @aztec/stdlib/auth-witness routes through a native `bb` process that isn't
// present in the container (the bb.js postinstall is blocked in Docker), so it
// throws "spawn .../bb ENOENT". The sync hash is identical to
// computeInnerAuthWitHash(fields) = poseidon2HashWithSeparator(fields, AUTHWIT_INNER).
import { poseidon2HashWithSeparator } from '@aztec/foundation/crypto/sync';
import { DomainSeparator } from '@aztec/constants';

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

  // Poseidon2 with the AUTHWIT_INNER domain separator — matches the Noir
  // attestation_lib's compute_inner_authwit_hash and the simple-attestor library.
  // Synchronous WASM hash (no native bb binary needed).
  const hash = poseidon2HashWithSeparator(
    fields,
    DomainSeparator.AUTHWIT_INNER
  );

  const sig = await schnorr.constructSignature(hash.toBuffer(), signingKey);
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
