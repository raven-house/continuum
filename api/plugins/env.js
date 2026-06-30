import env from '@fastify/env';
import fp from 'fastify-plugin';

export default fp(
  async fastify => {
    fastify.register(env, {
      dotenv: true,
      schema: {
        type: 'object',
        properties: {
          CONTINUUM_API_HOST: {
            type: 'string',
            default: '0.0.0.0'
          },
          CONTINUUM_API_PORT: {
            type: 'string',
            default: '3004'
          },
          CONTINUUM_DB_CONNECTION_STRING: {
            type: 'string'
          },
          CONTINUUM_DB_NAME: {
            type: 'string',
            default: 'continuum'
          },
          CONTINUUM_CORS_ORIGIN: {
            type: 'string',
            default: '*'
          },
          ATTESTER_SECRET: { type: 'string' },
          FASTIFY_CLOSE_GRACE_DELAY: { type: 'string', default: '500' },
          RD_HOST: { type: 'string' },
          RD_PORT: { type: 'string' }
        }
      }
    });
  },
  { name: 'env' }
);
