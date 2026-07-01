import http from 'http';
import { handler } from './lib';
import logger from './shared/logger.js';
import { mongodbConnection } from './shared/mongodb';

const intervalMs = Number(process.env.CONTINUUM_INDEXER_INTERVAL ?? 25000);
const network =
  (process.env.AZTEC_NETWORK ?? 'sandbox').trim().toLowerCase() || 'sandbox';
const maxRetries = Number(process.env.CONTINUUM_INDEXER_MAX_RETRIES ?? 3);
const healthPort = Number(process.env.CONTINUUM_INDEXER_HEALTH_PORT ?? 8080);
const healthThresholdMs = Number(
  process.env.CONTINUUM_INDEXER_HEALTH_TIMEOUT_MS ??
    Math.max(2 * intervalMs, 60000)
);

let isRunning = false;
let shuttingDown = false;
let indexerInterval: ReturnType<typeof setInterval> | null = null;
let statsInterval: ReturnType<typeof setInterval> | null = null;

const healthServer = http.createServer(async (req, res) => {
  if (req.url !== '/health') {
    res.statusCode = 404;
    res.end();
    return;
  }

  try {
    const db = mongodbConnection.getDb();
    const doc = await db
      .collection('sync_state')
      .findOne(
        {},
        { sort: { last_indexed_at: -1 }, projection: { last_indexed_at: 1 } }
      );

    res.setHeader('Content-Type', 'application/json');

    if (!doc?.last_indexed_at) {
      res.statusCode = 503;
      res.end(
        JSON.stringify({
          status: 'initializing',
          message: 'No indexing run has completed yet'
        })
      );
      return;
    }

    const lastIndexedAt =
      doc.last_indexed_at instanceof Date
        ? doc.last_indexed_at.getTime()
        : new Date(doc.last_indexed_at).getTime();

    if (Date.now() - lastIndexedAt > healthThresholdMs) {
      res.statusCode = 503;
      res.end(
        JSON.stringify({
          status: 'stale',
          last_indexed_at: doc.last_indexed_at
        })
      );
      return;
    }

    res.statusCode = 200;
    res.end(
      JSON.stringify({
        status: 'healthy',
        last_indexed_at: doc.last_indexed_at
      })
    );
  } catch (err: any) {
    res.statusCode = 503;
    res.end(JSON.stringify({ status: 'unhealthy', error: err.message }));
  }
});

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runHandlerWithRetries(): Promise<void> {
  let attempt = 0;

  while (true) {
    try {
      await handler(network);
      return;
    } catch (err: any) {
      logger.error(
        { err, attempt },
        `Indexer run failed for network ${network}`
      );

      if (attempt >= maxRetries) {
        logger.error(
          `Indexer run exhausted all ${maxRetries} retries for network ${network}`
        );
        throw err;
      }

      const backoff = Math.min(1000 * 2 ** attempt, 30000);
      logger.info(
        `Retrying indexer run in ${backoff}ms (attempt ${attempt + 1}/${maxRetries})`
      );
      await sleep(backoff);
      attempt++;
    }
  }
}

async function runHandler(): Promise<void> {
  if (isRunning) {
    logger.warn(`Indexer for network ${network} is already running, skipping`);
    return;
  }

  isRunning = true;
  logger.info(`Starting indexer for network: ${network}`);

  try {
    await runHandlerWithRetries();
    logger.info(`Indexer finished. Network: ${network}`);
  } catch (err: any) {
    logger.error({ err }, `Indexer failed after retries. Network: ${network}`);
  } finally {
    isRunning = false;
  }
}

async function initializeApp(): Promise<void> {
  try {
    await mongodbConnection.connect();
    logger.info('MongoDB connected');
    logger.info(
      `Indexer scheduled for network "${network}" every ${intervalMs}ms (maxRetries: ${maxRetries})`
    );

    await runHandler();

    indexerInterval = setInterval(() => {
      if (!shuttingDown) {
        void runHandler();
      }
    }, intervalMs);

    statsInterval = setInterval(async () => {
      try {
        const serverStatus = await mongodbConnection
          .getDb()
          .admin()
          .serverStatus();
        logger.info(
          `MongoDB connections — current: ${serverStatus.connections.current}, available: ${serverStatus.connections.available}`
        );
      } catch (err: any) {
        logger.error({ err }, 'Failed to fetch MongoDB server status');
      }
    }, 60000);

    healthServer.listen(healthPort, () => {
      logger.info(`Indexer health server listening on port ${healthPort}`);
    });
  } catch (error: any) {
    logger.error({ error }, 'Failed to connect to MongoDB');
    process.exit(1);
  }
}

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  logger.info(`Received ${signal}. Shutting down...`);

  if (indexerInterval) {
    clearInterval(indexerInterval);
    indexerInterval = null;
  }

  if (statsInterval) {
    clearInterval(statsInterval);
    statsInterval = null;
  }

  if (healthServer.listening) {
    await new Promise<void>(resolve => healthServer.close(() => resolve()));
  }

  await mongodbConnection.close();
  logger.info('Shutdown complete');
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

void initializeApp();
