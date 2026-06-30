import fp from 'fastify-plugin';

/**
 * Admin authentication plugin.
 *
 * Protects mutation endpoints (POST, PATCH, DELETE) with a shared-secret bearer
 * token. The token is set via the CONTINUUM_ADMIN_API_KEY env var. When the env
 * var is absent the plugin runs in "open" mode — useful for local development —
 * but logs a warning on boot so operators know management endpoints are
 * unauthenticated.
 *
 * Routes that should require admin access register the `adminAuth` preHandler:
 *   { preHandler: [fastify.adminAuth] }
 */
export default fp(
  async fastify => {
    const adminKey = process.env.CONTINUUM_ADMIN_API_KEY;

    if (!adminKey) {
      fastify.log.warn(
        'CONTINUUM_ADMIN_API_KEY is not set — management endpoints (contract upload/update/delete, ' +
        'collection register) are unauthenticated. Set CONTINUUM_ADMIN_API_KEY in production.'
      );
    }

    /**
     * Verify the Bearer token against CONTINUUM_ADMIN_API_KEY.
     * If no key is configured, the check is skipped (open mode).
     */
    fastify.decorate('adminAuth', async (request, reply) => {
      if (!adminKey) {
        return;
      }

      const auth = request.headers.authorization;
      if (!auth || !auth.startsWith('Bearer ')) {
        reply.code(401).send({
          statusCode: 401,
          error: 'Unauthorized',
          message:
            'Missing or invalid Authorization header. Expected: Bearer <token>'
        });
        return;
      }

      const token = auth.slice(7);
      if (token !== adminKey) {
        reply.code(403).send({
          statusCode: 403,
          error: 'Forbidden',
          message: 'Invalid admin API key'
        });
      }
    });
  },
  { name: 'adminAuth', dependencies: ['env'] }
);
