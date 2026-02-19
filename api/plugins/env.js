import env from '@fastify/env';
import fp from 'fastify-plugin';

export default fp(
  async fastify => {
    fastify.register(env, {
      dotenv: true,
      schema: {
        type: 'object',
        required: ['RD_PORT'],
        properties: {
          RD_HOST: {
            type: 'string',
            default: '127.0.0.1'
          },
          RD_PORT: {
            type: 'string',
            default: '80'
          },
          RD_ADMIN_TOKEN: {
            type: 'string'
          },
          RD_API_KEY_SECRET: {
            type: 'string'
          },
          SUPABASE_URL: { type: 'string' },
          SUPABASE_SERVICE_ROLE_KEY: { type: 'string' },
          DISCORD_BOT_TOKEN: { type: 'string' },
          DISCORD_PUBLIC_KEY: { type: 'string' },
          RAVEN_APP_URL: { type: 'string' }
        }
      }
    });
  },
  { name: 'env' }
);
