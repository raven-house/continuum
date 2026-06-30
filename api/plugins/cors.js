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
// We need to allow user to define these origins in .env file
const allowedOrigins = ['http://localhost:3000', 'http://localhost:3004'];
