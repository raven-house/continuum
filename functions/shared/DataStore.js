import { Collection, Db } from 'mongodb';
import { mongodbConnection } from './mongodb'
/**
 * @abstract
 */
export default class DataStore {
  /** @type {Db} */
  #db;
  /** @type {Collection<import('mongodb').Document>} */
  #_indexedBlockCollection;
  #mode;

  constructor(mode) {
    this.#db = mongodbConnection.getDb();
    this.#mode = mode;
  }

  /**
   * Gets the last indexed block number by indexer id.
   * @param {string} id The indexer id.
   * @returns {Promise<number?>} The last indexed block number if any.
   */
  async getLastIndexedBlockNumber(id) {
    console.log("last index ID", id)
    const record = await this.#indexedBlockCollection.findOne({ id });

    return record?.blockNumber;
  }

  /**
   * Saves the last indexed block number for a given indexer id.
   * @param {string} id The indexer id.
   * @param {number} blockNumber A block number.
   * @returns {Promise<void>}
   */
  async setLastIndexedBlockNumber(id, blockNumber) {
    await this.#indexedBlockCollection.updateOne(
      { id },
      { $set: { blockNumber } },
      { upsert: true }
    );
  }

  /**
   * The database instance.
   * @type {Db}
   * @protected
   */
  get _db() {
    return this.#db;
  }

  get _mode() {
    return this.#mode
  }
  _getCollectionName(name) {
    const collectionName = this._mode === "TESTNET" ? `${name}_testnet` : this._mode === "DEVNET" ? `${name}_devnet` : `${name}_sandbox`
    return collectionName
  }
  /**
   * The indexed blocks collection.
   * @type {Collection<import('mongodb').Document>}
   */
  get #indexedBlockCollection() {
    return (this.#_indexedBlockCollection ??=
      this.#db.collection('indexed_blocks'));
  }
}
