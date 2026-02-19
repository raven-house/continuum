import cors from '@fastify/cors';
import fp from 'fastify-plugin';

export default fp(async fastify => {
  fastify.register(cors, {
    credentials: true,
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error('Not allowed'), false);
    }
  });
});

const allowedOrigins = [
  "https://bridge.ravenhouse.xyz",
  'https://ravenhouse.xyz',
  'https://app.ravenhouse.xyz',
  'http://localhost:3004',
  'https://staging-app.ravenhouse.xyz'
];
