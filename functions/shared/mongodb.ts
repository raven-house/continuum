import { MongoClient, Db } from 'mongodb';

class MongoDBConnection {
  private static instance: MongoDBConnection;
  private client: MongoClient | null = null;
  private db: Db | null = null;

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

    if (!process.env.RH_DB_CONNECTION_STRING) {
      throw new Error('MongoDB connection string is not defined');
    }

    this.client = new MongoClient(process.env.RH_DB_CONNECTION_STRING, {
      maxPoolSize: 50, // Adjust based on your needs (10-100 is typical)
      minPoolSize: 5,
      maxIdleTimeMS: 30000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 30000,
      serverSelectionTimeoutMS: 5000,
    });

    await this.client.connect();
    this.db = this.client.db(process.env.RH_DB_NAME);

    return this.db;
  }

  async close(): Promise<void> {
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
