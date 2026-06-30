import { Fr } from '@aztec/foundation/curves/bn254';
import { Schnorr } from '@aztec/foundation/crypto/schnorr';
import { deriveSigningKey } from '@aztec/stdlib/keys';
import {
  poseidon2Hash,
  poseidon2HashWithSeparator
} from '@aztec/foundation/crypto/sync';
import { DomainSeparator } from '@aztec/constants';

// "NFTM" — must match MIGRATE_DOMAIN in nft_contract/src/main.nr
const MIGRATE_DOMAIN = Fr.fromString('0x4e46544d');

// "NFTMR" — domain separator for the migration-registration commitment.
// This value is NOT verified on-chain (register_migration just stores the
// commitment); it only needs to be agreed between whoever computes the
// commitment before calling register_migration on the old rollup and this
// service, which recomputes it from the revealed secret in /request_data.
const MIGRATE_REGISTER_DOMAIN = Fr.fromString('0x4e46544d52');

/**
 * Compute the migration-registration commitment from a user's secret.
 *
 * commitment = Poseidon2([ MIGRATE_REGISTER_DOMAIN, secret ])
 *
 * The user computes this off-chain and passes it to `register_migration` on the
 * old rollup, where the contract emits `MigrationRegistered { owner: msg_sender,
 * migration_commitment }`. Because `owner` is the authenticated `msg_sender`,
 * the on-chain event is an unforgeable binding between the real old-rollup owner
 * and this commitment. Later, in /request_data, the user reveals the secret and
 * Continuum recomputes the same commitment to resolve their verified owner.
 * @param {string} secretHex  - The user's migration secret (0x-prefixed hex Field)
 * @returns {string} commitment as a canonical 0x-prefixed Field string
 */
export function computeMigrationCommitment(secretHex) {
  const secret = Fr.fromHexString(secretHex);
  return poseidon2Hash([MIGRATE_REGISTER_DOMAIN, secret]).toString();
}

/**
 * Generate a fresh random migration secret and its commitment.
 * Stateless helper for the registration UI — Continuum stores nothing.
 * @returns {{ secret: string, commitment: string }}
 */
export function generateMigrationSecret() {
  const secret = Fr.random().toString();
  return { secret, commitment: computeMigrationCommitment(secret) };
}

let _cached = null;

/**
 *
 */
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
 * [ MIGRATE_DOMAIN, collection_address, new_wallet_address, token_id ]
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

  const sig = await schnorr.constructSignature(hash, signingKey);
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
 * @returns {{ x: string, y: string }}
 */
export async function getAttesterPublicKey() {
  const { publicKey } = await getAttester();
  return publicKey;
}
