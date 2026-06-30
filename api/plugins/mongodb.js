import fp from 'fastify-plugin';
import mongodb from '@fastify/mongodb';
import { getDbName } from '../shared/config.js';

export default fp(
  async fastify => {
    if (!process.env.CONTINUUM_DB_CONNECTION_STRING) {
      throw new Error(
        'MongoDB connection string not found. ' +
          'Set CONTINUUM_DB_CONNECTION_STRING in your .env file'
      );
    }

    fastify.register(mongodb, {
      forceClose: true,
      url: process.env.CONTINUUM_DB_CONNECTION_STRING,
      database: getDbName()
    });
  },
  { name: 'mongodb', dependencies: ['env'] }
);
