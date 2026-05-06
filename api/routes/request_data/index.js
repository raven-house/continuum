/**
 * POST /request_data
 *
 * Given a migration key and a new-rollup collection address, return Schnorr-attested
 * ownership data for every NFT the user held on the old rollup.
 *
 * The returned { token_id, signature_bytes } pairs are ready to be passed directly to
 * the NFT contract's migrate_and_claim(token_id, signature) function on the new rollup.
 *
 * Security:
 *   - Attestations are bound to new_wallet_address — only that address can use them
 *   - Attestations are bound to collection_address — can't be replayed on another contract
 *   - MIGRATE_DOMAIN (0x4e46544d) prevents replay against other contract methods
 */

import { signMigrationClaim } from '../../services/attester.js';
import schemas from './schemas.js';

const MIGRATION_KEYS_COLLECTION = 'migration_keys';
const COLLECTION_REGISTRY_COLLECTION = 'collection_registry';
const EVENTS_COLLECTION = 'events';

/**
 * @param {import('fastify').FastifyInstance} fastify
 */
export default async function (fastify) {
  fastify.post('/', { schema: schemas.requestData }, async (request, reply) => {
    const {
      collection_address,
      migration_key,
      new_wallet_address,
      event_name = 'MetadataUpdate'
    } = request.body;

    const db = fastify.mongo.client.db(process.env.CONTINUUM_DB_NAME);

    // ── 1. Resolve migration_key → old-rollup wallet address ─────────────────
    const migrationKeyDoc = await db
      .collection(MIGRATION_KEYS_COLLECTION)
      .findOne({ secretKey: migration_key });

    if (!migrationKeyDoc) {
      reply.notFound('No wallet found for the provided migration key');
      return;
    }

    const oldWalletAddress = migrationKeyDoc.walletAddress;

    // ── 2. Resolve new collection address → old collection address ────────────
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

    // ── 3. Query events: find NFTs owned by this user on the old collection ───
    // We look for the most recent MetadataUpdate event per token_id where owner == user.
    // This handles transfers: if Alice transferred token #5 to Bob, Bob's event is newer.
    const events = await db
      .collection(EVENTS_COLLECTION)
      .aggregate([
        {
          $match: {
            contract_address: oldCollectionAddress,
            event_type: event_name
          }
        },
        // Sort newest first so $first picks the latest owner per token
        { $sort: { block_number: -1 } },
        {
          $group: {
            _id: '$data.token_id',
            latest_owner: { $first: '$data.owner' },
            block_number: { $first: '$block_number' }
          }
        },
        // Keep only tokens currently owned by this user
        {
          $match: { latest_owner: oldWalletAddress }
        }
      ])
      .toArray();

    if (events.length === 0) {
      return {
        old_wallet_address: oldWalletAddress,
        new_wallet_address,
        collection_address: newCollectionAddr,
        old_collection_address: oldCollectionAddress,
        tokens: []
      };
    }

    // ── 4. Sign each token ID with the Continuum attester ────────────────────
    const tokens = await Promise.all(
      events.map(async e => {
        const tokenId = e._id; // token_id from the grouped event

        const { signature, signatureBytes } = await signMigrationClaim(
          newCollectionAddr,
          new_wallet_address.toLowerCase(),
          tokenId
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

    return {
      old_wallet_address: oldWalletAddress,
      new_wallet_address,
      collection_address: newCollectionAddr,
      old_collection_address: oldCollectionAddress,
      tokens
    };
  });
}
