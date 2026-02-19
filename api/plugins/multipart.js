import fp from 'fastify-plugin';
import multipart from '@fastify/multipart';

export default fp(async fastify => {
  fastify.register(multipart, {
    limits: {
      fileSize: 5000 * 1024 * 1024
    }
  });
});
