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
