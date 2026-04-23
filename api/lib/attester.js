/**
 * Schnorr attestation signing for the Continuum API.
 *
 * Mirrors simple-attestor/src/index.ts — must produce identical signatures
 * so the MigrationClaims Noir contract can verify them.
 *
 * Signing scheme:
 *   hash = Poseidon2([DOMAIN, ...fields])
 *   sig  = Schnorr.sign(hash, deriveSigningKey(secretKey))
 */

import { Fr } from '@aztec/foundation/curves/bn254';
import { Schnorr } from '@aztec/foundation/crypto/schnorr';
import { deriveSigningKey } from '@aztec/stdlib/keys';
import { computeInnerAuthWitHash } from '@aztec/stdlib/auth-witness';

// Domain separator: "CLM" — prevents cross-method signature replay
const CLAIM_DOMAIN = new Fr(0x434c4d);

/**
 * Sign a migration claim.
 *
 * @param {string} secretKeyHex  - Attester secret key (0x-prefixed hex)
 * @param {string} contractAddress - MigrationClaims contract address (0x-prefixed hex)
 * @param {string} userAddress   - User's Aztec address (0x-prefixed hex)
 * @param {number|bigint} amount - Claim amount
 * @returns {Promise<{ signature: string, sigBytes: number[], hash: string }>}
 */
export async function createAttestation(secretKeyHex, contractAddress, userAddress, amount) {
  const sk = Fr.fromHexString(secretKeyHex.startsWith('0x') ? secretKeyHex.slice(2) : secretKeyHex);
  const signingKey = deriveSigningKey(sk);
  const schnorr = new Schnorr();

  const contractFr = Fr.fromHexString(contractAddress.startsWith('0x') ? contractAddress.slice(2) : contractAddress);
  const userFr = Fr.fromHexString(userAddress.startsWith('0x') ? userAddress.slice(2) : userAddress);
  const amountFr = new Fr(BigInt(amount));

  const fields = [CLAIM_DOMAIN, contractFr, userFr, amountFr];
  const hash = await computeInnerAuthWitHash(fields);

  const sig = await schnorr.constructSignature(hash.toBuffer(), signingKey);
  const sigHex = `0x${Buffer.from(sig.toBuffer()).toString('hex')}`;
  const sigBytes = Array.from(Buffer.from(sigHex.slice(2), 'hex'));

  return { signature: sigHex, sigBytes, hash: hash.toString() };
}
