import fp from 'fastify-plugin';
import swaggerUI from '@fastify/swagger-ui';

export default fp(async fastify => {
  // if (process.env.NODE_ENV === 'production') {
  //   return;
  // }

  fastify.register(swaggerUI, {
    routePrefix: '/swagger',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: false,
      operationsSorter: 'alpha'
    },
    uiHooks: {
      onRequest: function (request, reply, next) {
        next();
      },
      preHandler: function (request, reply, next) {
        next();
      }
    },
    staticCSP: true,
    transformStaticCSP: header => header,
    transformSpecification: swaggerObject => swaggerObject,
    transformSpecificationClone: true
  });
});
