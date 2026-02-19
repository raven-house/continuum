/**
 *
 * @param fastify
 */
export default async function (fastify) {
  fastify.get('/', async function () {
    return { status: 'RUNNING' };
  });
}
