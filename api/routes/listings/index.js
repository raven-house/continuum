/**
 *
 * We need an endpoint that fetches all the active listings and also supports pagination.
 */
import schemas from './schemas.js';
/**
 * @param {import('fastify').FastifyPluginAsync} fastify @ignore
 */

/**
 *
 * @param fastify
 */
export default async function (fastify) {
  fastify.get(
    '/:network/all',
    { schema: schemas.getAllListings },
    /**
     * @ignore
     * @param {import('fastify').FastifyRequest} request @ignore
     * @param {import('fastify').FastifyReply} reply @ignore
     */
    async function (request, reply) {
      const { network } = request.params;
      const {
        nft_contract,
        collection_id,
        token_id,
        seller,
        status,
        mode,
        page,
        limit
      } = request.query;

      const dbStore =
        network === 'devnet'
          ? this.dbStoreDevnet
          : network === 'testnet'
            ? this.dbStoreTestnet
            : this.dbStoreSandbox;

      let result;
      try {
        result = await dbStore.getAllListings(
          {
            nft_contract,
            collection_id,
            token_id,
            seller,
            status,
            mode,
            page,
            limit
          },
          this.supabase
        );
      } catch (e) {
        this.log.error(e, 'Failed getting all listings');
        reply.internalServerError('Failed getting all listings');
        return;
      }

      return result;
    }
  );
}
