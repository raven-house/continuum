import fastifyRawBody from 'fastify-raw-body';
import fp from 'fastify-plugin';

/**
 * This plugin adds the rawBody property to the request object.
 */
export default fp(async fastify => {
  fastify.register(fastifyRawBody, {
    field: 'rawBody',
    global: false
  });
});
