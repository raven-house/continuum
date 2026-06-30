import fp from 'fastify-plugin';
import swagger from '@fastify/swagger';

export default fp(async fastify => {
  // if (process.env.NODE_ENV === 'production') {
  //   return;
  // }

  fastify.register(swagger, {
    exposeRoute: true,
    hideUntagged: false,
    openapi: {
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer'
          }
        }
      },
      info: {
        title: 'api.continuum',
        description: 'Continuum API Server',
        version: '1.0.0-preview'
      },
      security: [{ bearerAuth: [] }]
    }
  });
});
