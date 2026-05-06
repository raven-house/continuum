/**
 * GET /attester/pubkey
 *
 * Returns the Continuum attester's Grumpkin public key coordinates.
 * Collection owners pass these values to the NFT contract constructor
 * as `migration_attester_pubkey_x` and `migration_attester_pubkey_y`.
 */

import { getAttesterPublicKey } from '../../services/attester.js';

/**
 * @param {import('fastify').FastifyInstance} fastify
 */
export default async function (fastify) {
  fastify.get('/', async (_request, reply) => {
    try {
      const { x, y } = await getAttesterPublicKey();
      return { x, y };
    } catch (err) {
      reply.internalServerError('Attester not configured: ' + err.message);
    }
  });
}
