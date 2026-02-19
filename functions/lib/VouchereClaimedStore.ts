import DataStore from '../shared/DataStore.js'
import type { DBVoucherClaimed } from '../types.js'

export default class VoucherClaimedStore extends DataStore {
  /** @type {import('mongodb').Collection<import('mongodb').Document>} */
  #_collection: any

  /**
   * Bulk add voucher claimed events.
   * @param {number[][]} rates An array of arrays as `[timestamp, rate]`.
   * @returns {Promise<void>}
   */
  async addEvents(events: DBVoucherClaimed[]) {
    const payload = events.map(({ token_id, claimer, amount, collection_address }) => ({
      updateOne: {
        filter: { token_id, claimer, amount, collection_address },
        update: {
          $set: { token_id, claimer, amount, collection_address },
        },
        upsert: true,
      },
    }))
    await this.#collection.bulkWrite(payload)
  }

  get #collection() {
    return (this.#_collection ??= this._db.collection(this._getCollectionName('voucher_claimed')))
  }
}
