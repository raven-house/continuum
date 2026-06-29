/**
 * POST /request_data
 *
 * Given a migration secret and a new-rollup collection address, return Schnorr-attested
 * ownership data for every NFT the user held (publicly) on the old rollup.
 *
 * The returned { token_id, signature_bytes } pairs are ready to be passed directly to
 * the NFT contract's migrate_and_claim(token_id, signature) function on the new rollup.
 *
 * Ownership identity is established ON-CHAIN, not by a trusted off-chain mapping:
 *   - On the old rollup the real owner called register_migration(commitment), which
 *     emitted MigrationRegistered { owner: msg_sender, migration_commitment }. The
 *     owner is the authenticated msg_sender, so it cannot be spoofed.
 *   - Here the user reveals the secret. We recompute commitment = Poseidon2([
 *     MIGRATE_REGISTER_DOMAIN, secret ]) and look up the registered event to resolve
 *     the verified old-rollup owner. The commitment is public on-chain, so only the
 *     holder of the secret preimage can prove they are the registrant.
 *
 * Public ownership of individual tokens is then derived from Transfer events: the
 * current public owner of a token is the `to` of its most recent Transfer.
 *
 * Security:
 *   - Attestations are bound to new_wallet_address — only that address can use them
 *   - Attestations are bound to collection_address — can't be replayed on another contract
 *   - MIGRATE_DOMAIN (0x4e46544d) prevents replay against other contract methods
 */

import {
  computeMigrationCommitment,
  signMigrationClaim
} from '../../services/attester.js';
import schemas from './schemas.js';

const COLLECTION_REGISTRY_COLLECTION = 'collection_registry';
const EVENTS_COLLECTION = 'events';

const REGISTRATION_EVENT = 'MigrationRegistered';
const TRANSFER_EVENT = 'Transfer';

/**
 * @param {import('fastify').FastifyInstance} fastify
 */
export default async function (fastify) {
  fastify.post('/', { schema: schemas.requestData }, async (request, reply) => {
    const { collection_address, migration_secret, new_wallet_address } =
      request.body;

    const db = fastify.mongo.client.db(process.env.CONTINUUM_DB_NAME);

    // ── 1. Resolve new collection address → old collection address ────────────
    const newCollectionAddr = collection_address.toLowerCase();
    const registryDoc = await db
      .collection(COLLECTION_REGISTRY_COLLECTION)
      .findOne({ new_collection_address: newCollectionAddr });

    if (!registryDoc) {
      reply.notFound(
        `Collection ${collection_address} is not registered for migration. ` +
          'The collection owner must call POST /collections/register first.'
      );
      return;
    }

    const oldCollectionAddress = registryDoc.old_collection_address;

    // ── 2. Resolve migration_secret → verified old-rollup owner ──────────────
    // commitment = Poseidon2([MIGRATE_REGISTER_DOMAIN, secret]); look it up among
    // MigrationRegistered events emitted on the OLD collection. The matching
    // event's `owner` is the authenticated msg_sender that registered it.
    const commitment = computeMigrationCommitment(migration_secret);

    const registration = await db.collection(EVENTS_COLLECTION).findOne({
      contract_address: oldCollectionAddress,
      event_type: REGISTRATION_EVENT,
      'data.migration_commitment': commitment
    });

    if (!registration) {
      reply.notFound(
        'No on-chain migration registration found for this secret on collection ' +
          `${oldCollectionAddress}. The owner must call register_migration() on the ` +
          'old rollup with the matching commitment before requesting migration data.'
      );
      return;
    }

    const oldWalletAddress = String(registration.data.owner).toLowerCase();

    // ── 3. Find tokens publicly owned by this wallet on the old collection ────
    // Current public owner of a token = the `to` of its most recent Transfer.
    // We keep only tokens whose latest owner is this wallet.
    const events = await db
      .collection(EVENTS_COLLECTION)
      .aggregate([
        {
          $match: {
            contract_address: oldCollectionAddress,
            event_type: TRANSFER_EVENT
          }
        },
        // Sort newest first so $first picks the latest owner per token
        { $sort: { block_number: -1 } },
        {
          $group: {
            _id: '$data.token_id',
            latest_owner: { $first: '$data.to' },
            block_number: { $first: '$block_number' }
          }
        },
        // Keep only tokens whose latest public owner is this wallet.
        // (latest_owner == ZERO means burned; == PRIVATE magic means moved private —
        //  neither can equal a real wallet, so this match excludes them.)
        {
          $match: { latest_owner: oldWalletAddress }
        }
      ])
      .toArray();

    const baseResponse = {
      old_wallet_address: oldWalletAddress,
      new_wallet_address,
      collection_address: newCollectionAddr,
      old_collection_address: oldCollectionAddress
    };

    if (events.length === 0) {
      return { ...baseResponse, tokens: [] };
    }

    // ── 4. Sign each token ID with the Continuum attester ────────────────────
    // The stage-3 $match (latest_owner == oldWalletAddress) already excludes
    // burned (to == zero) and gone-private (to == PRIVATE magic) tokens, since
    // neither sentinel can equal a real wallet address.
    const tokens = await Promise.all(
      events.map(async e => {
        const tokenId = e._id; // token_id from the grouped event

        const { signature, signatureBytes } = await signMigrationClaim(
          newCollectionAddr,
          new_wallet_address.toLowerCase(),
          BigInt(tokenId)
        );

        return {
          token_id: String(tokenId),
          signature,
          signature_bytes: signatureBytes
        };
      })
    );

    fastify.log.info(
      `Migration data signed for ${oldWalletAddress} → ${new_wallet_address}: ` +
        `${tokens.length} token(s) on collection ${newCollectionAddr}`
    );

    return { ...baseResponse, tokens };
  });
}
