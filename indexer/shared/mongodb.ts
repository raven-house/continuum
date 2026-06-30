import { MongoClient, Db, type MongoClientOptions } from 'mongodb';

const DEFAULT_MAX_POOL_SIZE = 10;
const DEFAULT_MIN_POOL_SIZE = 0;
const DEFAULT_MAX_CONNECTING = 2;
const DEFAULT_MAX_IDLE_TIME_MS = 30000;
const DEFAULT_SOCKET_TIMEOUT_MS = 45000;
const DEFAULT_CONNECT_TIMEOUT_MS = 30000;
const DEFAULT_SERVER_SELECTION_TIMEOUT_MS = 5000;

function readNumberEnv(name: string, fallback: number, min = 0): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const value = Number(raw);
  return Number.isFinite(value) && value >= min ? value : fallback;
}

class MongoDBConnection {
  private static instance: MongoDBConnection;
  private client: MongoClient | null = null;
  private db: Db | null = null;
  private connectionPromise: Promise<Db> | null = null;

  private constructor() { }

  static getInstance(): MongoDBConnection {
    if (!MongoDBConnection.instance) {
      MongoDBConnection.instance = new MongoDBConnection();
    }
    return MongoDBConnection.instance;
  }

  async connect(): Promise<Db> {
    if (this.db) {
      return this.db;
    }

    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    if (!process.env.CONTINUUM_DB_CONNECTION_STRING) {
      throw new Error('MongoDB connection string is not defined');
    }

    const options: MongoClientOptions = {
      maxPoolSize: readNumberEnv('CONTINUUM_MONGODB_MAX_POOL_SIZE', DEFAULT_MAX_POOL_SIZE, 1),
      minPoolSize: readNumberEnv('CONTINUUM_MONGODB_MIN_POOL_SIZE', DEFAULT_MIN_POOL_SIZE),
      maxConnecting: readNumberEnv('CONTINUUM_MONGODB_MAX_CONNECTING', DEFAULT_MAX_CONNECTING, 1),
      maxIdleTimeMS: readNumberEnv('CONTINUUM_MONGODB_MAX_IDLE_TIME_MS', DEFAULT_MAX_IDLE_TIME_MS),
      socketTimeoutMS: readNumberEnv('CONTINUUM_MONGODB_SOCKET_TIMEOUT_MS', DEFAULT_SOCKET_TIMEOUT_MS),
      connectTimeoutMS: readNumberEnv('CONTINUUM_MONGODB_CONNECT_TIMEOUT_MS', DEFAULT_CONNECT_TIMEOUT_MS),
      serverSelectionTimeoutMS: readNumberEnv(
        'CONTINUUM_MONGODB_SERVER_SELECTION_TIMEOUT_MS',
        DEFAULT_SERVER_SELECTION_TIMEOUT_MS,
      ),
    };

    this.client = new MongoClient(process.env.CONTINUUM_DB_CONNECTION_STRING, options);

    this.connectionPromise = this.client
      .connect()
      .then((client) => {
        this.db = client.db(process.env.CONTINUUM_DB_NAME);
        return this.db;
      })
      .catch((error) => {
        this.client = null;
        this.db = null;
        throw error;
      })
      .finally(() => {
        this.connectionPromise = null;
      });

    return this.connectionPromise;
  }

  async close(): Promise<void> {
    if (this.connectionPromise) {
      await this.connectionPromise.catch(() => undefined);
    }

    if (this.client) {
      await this.client.close();
      this.client = null;
      this.db = null;
    }
  }

  getDb(): Db {
    if (!this.db) {
      throw new Error('Database not connected. Call connect() first.');
    }
    return this.db;
  }
}

export const mongodbConnection = MongoDBConnection.getInstance();
