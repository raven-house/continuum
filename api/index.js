/* eslint-disable no-unused-vars */
import 'dotenv/config';
import app from './app.js';
import closeWithGrace from 'close-with-grace';
import Fastify from 'fastify';

const fastify = Fastify({
  logger: true,
  bodyLimit: 1073741824, // 1GB
  connectionTimeout: 300000, // 5 minutes
  requestTimeout: 300000 // 5 minutes
});

fastify.register(app);

// delay is the number of milliseconds for the graceful close to finish
const closeListeners = closeWithGrace(
  { delay: process.env.FASTIFY_CLOSE_GRACE_DELAY || 500 },
  async function ({ signal, err, manual }) {
    if (err) {
      fastify.log.error(err);
    }

    await fastify.close();
  }
);

fastify.addHook('onClose', async (instance, done) => {
  closeListeners.uninstall();
  done();
});

const host = process.env.RD_HOST || process.env.CONTINUUM_API_HOST || '0.0.0.0';
const port = Number(
  process.env.RD_PORT || process.env.CONTINUUM_API_PORT || 3004
);

fastify.listen({ host, port }, err => {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
});
