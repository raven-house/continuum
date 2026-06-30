/**
 * Migration Secret Routes (stateless)
 *
 * Migration identity is established ON-CHAIN via the NFT contract's
 * register_migration(commitment) — the event records owner = msg_sender, which
 * cannot be spoofed. Continuum therefore stores NO wallet ↔ key mapping.
 *
 * This route only offers a convenience helper that mints a fresh secret and its
 * commitment for the registration UI. The user:
 *   1. GET /migration/new-secret           → { secret, commitment }
 *   2. calls register_migration(commitment) on the old rollup (authenticated)
 *   3. saves `secret` — it is the only thing needed to later claim on the new rollup
 *
 * Endpoints:
 *   GET  /migration/new-secret             - Generate a random { secret, commitment }
 *   POST /migration/commitment             - Compute the commitment for a given secret
 */

import {
  computeMigrationCommitment,
  generateMigrationSecret
} from '../../services/attester.js';
import schemas from './schemas.js';

/**
 * @param {import('fastify').FastifyInstance} fastify
 */
export default async function (fastify) {
  /* Stateless: generates a random secret and its commitment. Stores nothing. */
  fastify.get('/new-secret', { schema: schemas.newSecret }, async () => {
    const { secret, commitment } = generateMigrationSecret();
    return { secret, commitment };
  });

  // ─────────────────────────────────────────────────────────────
  // POST /migration/commitment
  // Stateless: compute the commitment for a user-supplied secret (e.g. to verify
  // a saved secret matches an on-chain registration). Stores nothing.
  // ─────────────────────────────────────────────────────────────
  fastify.post(
    '/commitment',
    { schema: schemas.commitment },
    async (request, reply) => {
      const { secret } = request.body;
      try {
        return { commitment: computeMigrationCommitment(secret) };
      } catch (err) {
        reply.badRequest('Invalid secret: ' + err.message);
      }
    }
  );
}
