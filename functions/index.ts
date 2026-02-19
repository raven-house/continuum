import cron from 'node-cron';
import fs from 'fs';
import path from 'path';
import winston from 'winston';
import { mongodbConnection } from './shared/mongodb';
import { handler } from './lib';
import { CollectionStatsAggregator } from './lib/CollectionStatsAggregator';

const logDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}


const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss' // Customize the format (local time)
    }),
    winston.format.printf(({ level, message, timestamp }) => {
      return `${timestamp} [${level.toUpperCase()}]: ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: path.join(logDir, 'indexer.log') })
  ],
});


// Track running instances to prevent race conditions
const runningInstances = new Set<string>();

async function runAllHandlers(mode: string) {
  // Check if this mode is already running
  if (runningInstances.has(mode)) {
    logger.warn(`Indexer for mode ${mode} is already running, skipping this execution`);
    return;
  }

  // Mark this mode as running
  runningInstances.add(mode);
  logger.info(`Starting indexer for mode: ${mode}`);

  try {
    await handler(mode);
    logger.info(`Indexer finished successfully. Mode: ${mode}, Time: ${new Date().toISOString()}`);
  } catch (err) {
    logger.error(`Indexer failed. Error: ${err}, Mode: ${mode}, Time: ${new Date().toISOString()}`);
  } finally {
    // Always remove from running instances, even on error
    runningInstances.delete(mode);
    logger.info(`Indexer instance for mode ${mode} completed and cleaned up`);
  }
}

async function runStatsAggregation(mode: string) {
    logger.info(`Starting Stats Aggregation for mode: ${mode}`);
    try {
        const aggregator = new CollectionStatsAggregator(mode);
        await aggregator.aggregateAndSave();
        logger.info(`Stats Aggregation finished successfully for ${mode}`);
    } catch (err) {
        logger.error(`Stats Aggregation failed for ${mode}. Error: ${err}`);
    }
}


// Run testnet every 25 seconds instead of every minute
cron.schedule('*/25 * * * * *', () => {
  logger.info('Scheduled task triggered for DEVNET');
  try {
    runAllHandlers("DEVNET");
  } catch (error) {
    console.log(`Failed to run handler for DEVNET`)
  }
});

logger.info('Cron jobs scheduled. DEVNET: every 25 seconds');

// Run stats aggregation every 10 minutes for historical snapshots
cron.schedule('*/10 * * * *', () => {
  logger.info('Scheduled task triggered for Stats Aggregation (DEVNET)');
  runStatsAggregation("DEVNET");
});

logger.info('Stats aggregation scheduled: every 10 minutes');


async function initializeApp() {
  try {
    await mongodbConnection.connect();
    logger.info('MongoDB connected successfully with connection pooling');
  } catch (error) {
    logger.error('Failed to connect to MongoDB:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Shutting down gracefully...');
  await mongodbConnection.close();
  process.exit(0);
});


initializeApp()
setInterval(async () => {
  const serverStatus = await mongodbConnection.getDb().admin().serverStatus();
  logger.info(`MongoDB connections - current: ${serverStatus.connections.current}, available: ${serverStatus.connections.available}`);
}, 60000); 
