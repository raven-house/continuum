import DataStore from '../shared/DataStore.js'
import type { DBOfferCancelled } from '../types.js'

export default class OfferCancelledStore extends DataStore {
  /** @type {import('mongodb').Collection<import('mongodb').Document>} */
  #_collection: any

  /**
   * Bulk add offer cancelled events.
   * @param {number[][]} rates An array of arrays as `[timestamp, rate]`.
   * @returns {Promise<void>}
   */
  async addEvents(events: DBOfferCancelled[]) {
    const payload = events.map(
      ({ offer_id, nft_contract, token_id, buyer, amount, blockNumber, timestamp, offer_contract }) => ({
        updateOne: {
          filter: { offer_id, nft_contract, token_id, buyer, amount, blockNumber, offer_contract },
          update: {
            $set: { offer_id, nft_contract, token_id, buyer, amount, blockNumber, timestamp, offer_contract },
          },
          upsert: true,
        },
      })
    )
    await this.#collection.bulkWrite(payload)
  }

  get #collection() {
    return (this.#_collection ??= this._db.collection(this._getCollectionName('offer_cancelled')))
  }
}
