import fp from 'fastify-plugin';
import mongodb from '@fastify/mongodb';

export default fp(
  async fastify => {
    fastify.register(mongodb, {
      forceClose: true,
      url: process.env.RH_DB_CONNECTION_STRING
    });
  },
  { name: 'mongodb', dependencies: ['env'] }
);
