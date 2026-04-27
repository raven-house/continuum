import cron from 'node-cron';
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

// Prevent the same network from running two indexer cycles concurrently
const runningInstances = new Set<string>();

async function runHandler(mode: string) {
  if (runningInstances.has(mode)) {
    logger.warn(`Indexer for mode ${mode} is already running, skipping`);
    return;
  }

  runningInstances.add(mode);
  logger.info(`Starting indexer for mode: ${mode}`);

  try {
    await handler(mode);
    logger.info(`Indexer finished. Mode: ${mode}`);
  } catch (err) {
    logger.error(`Indexer failed. Mode: ${mode}, Error: ${err}`);
  } finally {
    runningInstances.delete(mode);
  }
}

// Index every 25 seconds
cron.schedule('*/25 * * * * *', () => {
  runHandler('testnet');
});

logger.info('Cron scheduled: TESTNET every 25 seconds');

async function initializeApp() {
  try {
    await mongodbConnection.connect();
    logger.info('MongoDB connected');
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
