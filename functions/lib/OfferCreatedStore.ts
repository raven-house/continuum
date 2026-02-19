import DataStore from '../shared/DataStore.js'
import type { DBOfferCreated } from '../types.js'

export default class OfferCreatedStore extends DataStore {
  /** @type {import('mongodb').Collection<import('mongodb').Document>} */
  #_collection: any

  /**
   * Bulk add offer created events.
   * @param {number[][]} rates An array of arrays as `[timestamp, rate]`.
   * @returns {Promise<void>}
   */
  async addEvents(events: DBOfferCreated[]) {
    const payload = events.map(
      ({ offer_id, nft_contract, token_id, buyer, amount, expiry_block, blockNumber, timestamp, offer_contract }) => ({
        updateOne: {
          filter: { offer_id, nft_contract, token_id, buyer, amount, expiry_block, blockNumber, offer_contract },
          update: {
            $set: { offer_id, nft_contract, token_id, buyer, amount, expiry_block, blockNumber, timestamp, offer_contract },
          },
          upsert: true,
        },
      })
    )
    await this.#collection.bulkWrite(payload)
  }

  get #collection() {
    return (this.#_collection ??= this._db.collection(this._getCollectionName('offer_created')))
  }
}
