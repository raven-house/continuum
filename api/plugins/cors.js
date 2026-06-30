import cors from '@fastify/cors';
import fp from 'fastify-plugin';
import { getCorsOrigins } from '../shared/config.js';

export default fp(async fastify => {
  const allowedOrigins = getCorsOrigins();

  fastify.register(cors, {
    credentials: true,
    origin: (origin, callback) => {
      if (allowedOrigins === '*') {
        callback(null, true);
        return;
      }

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
