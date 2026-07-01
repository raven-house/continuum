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
 *   - On the old rollup the real owner called register_migration(old_collection,
 *     commitment), which emitted MigrationRegistered { owner: msg_sender,
 *     collection, migration_commitment }. The owner is the authenticated
 *     msg_sender, so it cannot be spoofed.
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
  buildMigrationData,
  MigrationDataError
} from '../../services/migrationData.js';
import schemas from './schemas.js';
import { getDbName } from '../../shared/config.js';

/**
 * @param {import('fastify').FastifyInstance} fastify
 */
export default async function (fastify) {
  fastify.post('/', { schema: schemas.requestData }, async (request, reply) => {
    try {
      const db = fastify.mongo.client.db(getDbName());
      const response = await buildMigrationData(db, request.body);

      fastify.log.info(
        `Migration data signed for ${response.old_wallet_address} ` +
          `to ${response.new_wallet_address}: ${response.tokens.length} ` +
          `token(s) on collection ${response.collection_address}`
      );

      return response;
    } catch (err) {
      if (err instanceof MigrationDataError && err.statusCode === 404) {
        reply.notFound(err.message);
        return;
      }
      throw err;
    }
  });
}
