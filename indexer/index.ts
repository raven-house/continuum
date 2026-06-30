import fs from 'fs';
import path from 'path';
import winston from 'winston';
import { mongodbConnection } from './shared/mongodb';
import { handler } from './lib';

const logDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(({ level, message, timestamp }) => {
      return `${timestamp} [${level.toUpperCase()}]: ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: path.join(logDir, 'indexer.log') }),
  ],
});

const intervalMs = Number(process.env.CONTINUUM_INDEXER_INTERVAL ?? 25000);
const network = (process.env.AZTEC_NETWORK ?? 'sandbox').trim().toLowerCase() || 'sandbox';

let isRunning = false;

async function runHandler() {
  if (isRunning) {
    logger.warn(`Indexer for network ${network} is already running, skipping`);
    return;
  }

  isRunning = true;
  logger.info(`Starting indexer for network: ${network}`);

  try {
    await handler(network);
    logger.info(`Indexer finished. Network: ${network}`);
  } catch (err) {
    logger.error(`Indexer failed. Network: ${network}, Error: ${err}`);
  } finally {
    isRunning = false;
  }
}

async function initializeApp() {
  try {
    await mongodbConnection.connect();
    logger.info('MongoDB connected');
    logger.info(`Indexer scheduled for network "${network}" every ${intervalMs}ms`);
    await runHandler();
    setInterval(() => {
      void runHandler();
    }, intervalMs);
  } catch (error) {
    logger.error('Failed to connect to MongoDB:', error);
    process.exit(1);
  }
}

process.on('SIGINT', async () => {
  logger.info('Shutting down...');
  await mongodbConnection.close();
  process.exit(0);
});

initializeApp();

// Log MongoDB connection pool stats every minute
setInterval(async () => {
  const serverStatus = await mongodbConnection.getDb().admin().serverStatus();
  logger.info(
    `MongoDB connections — current: ${serverStatus.connections.current}, available: ${serverStatus.connections.available}`
  );
}, 60000);
