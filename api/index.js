/* eslint-disable no-unused-vars */
import 'dotenv/config';
import app from './app.js';
import closeWithGrace from 'close-with-grace';
import Fastify from 'fastify';
import { getApiHost, getApiPort } from './shared/config.js';

const fastify = Fastify({
  logger: true,
  bodyLimit: 52428800, // 50MB
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

const host = getApiHost();
const port = getApiPort();

fastify.listen({ host, port }, err => {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
});
