import { ArtifactRegistry, type LoadedArtifact } from './ArtifactRegistry'
import { getPublicEventsForContract } from '../shared/getPublicEvents'
import { getAztecNode } from '../shared/aztecNode'
import { getBlockTimestamps, serializeEventData } from '../shared/utils'
import { mongodbConnection } from '../shared/mongodb'
import logger from '../shared/logger'
import { DEVNET, SANDBOX, TESTNET } from '../shared/aztec-config'

const BLOCK_RANGE = Number(process.env.CONTINUUM_INDEXER_BLOCK_RANGE ?? 14)

const DEFAULT_NODE_URL_MAP: Record<string, string | undefined> = {
  devnet: DEVNET.network.nodeUrl,
  testnet: TESTNET.network.nodeUrl,
  sandbox: SANDBOX.network.nodeUrl,
}

const ENV_NODE_URL_MAP: Record<string, string | undefined> = {
  devnet: process.env.CONTINUUM_AZTEC_NODE_URL_DEVNET,
  testnet: process.env.CONTINUUM_AZTEC_NODE_URL_TESTNET,
  sandbox: process.env.CONTINUUM_AZTEC_NODE_URL_SANDBOX,
}

export class EventIndexer {
  private registry: ArtifactRegistry
  private network: string

  constructor(network: string) {
    this.network = network.toLowerCase()
    this.registry = new ArtifactRegistry(this.network)
  }

  async run(): Promise<void> {
    const nodeUrl = ENV_NODE_URL_MAP[this.network] || DEFAULT_NODE_URL_MAP[this.network]
    console.log(`Starting indexer for network "${this.network}" with node URL: ${nodeUrl}`)
    if (!nodeUrl) {
      logger.warn(`No Aztec node URL for network "${this.network}", skipping`)
      return
    }

    const aztecNode = await getAztecNode(nodeUrl, this.network)
    const latestBlock = await aztecNode.getBlockNumber()
    logger.info(`Network "${this.network}" — latest block: ${latestBlock}`)

    const artifacts = await this.registry.getEnabledArtifacts()
    if (artifacts.length === 0) {
      logger.info(`No enabled artifacts for network "${this.network}"`)
      return
    }

    const addresses = await this.getIndexedAddresses()
    if (addresses.length === 0) {
      logger.info(
        `No collection addresses registered for network "${this.network}" — nothing to index yet`,
      )
      return
    }

    // Floor for a never-seen address: the earliest startBlock across enabled artifacts.
    const defaultStartBlock = Math.min(...artifacts.map((a) => a.startBlock ?? 0))

    logger.info(
      `Network "${this.network}" — indexing ${addresses.length} address(es): [${addresses
        .map((a) => a.slice(0, 10))
        .join(', ')}]`,
    )

    // Each address is indexed independently so one failure doesn't block the others.
    await Promise.all(
      addresses.map((address) =>
        this.indexAddress(address, artifacts, aztecNode, latestBlock, defaultStartBlock).catch(
          (err) => logger.error(`Indexing address ${address} failed: ${err}`),
        ),
      ),
    )
  }

  /** Distinct collection addresses to index for this network (old + new sides). */
  private async getIndexedAddresses(): Promise<string[]> {
    const db = mongodbConnection.getDb()
    const docs = await db
      .collection('collection_registry')
      .find({ $or: [{ old_network: this.network }, { new_network: this.network }] })
      .toArray()

    const set = new Set<string>()
    for (const d of docs) {
      if (d.old_network === this.network && d.old_collection_address) {
        set.add(String(d.old_collection_address).toLowerCase())
      }
      if (d.new_network === this.network && d.new_collection_address) {
        set.add(String(d.new_collection_address).toLowerCase())
      }
    }
    return [...set]
  }

  private async indexAddress(
    address: string,
    artifacts: LoadedArtifact[],
    aztecNode: any,
    latestBlock: number,
    defaultStartBlock: number,
  ): Promise<void> {
    const db = mongodbConnection.getDb()
    const syncStateCollection = db.collection('sync_state')
    const eventsCollection = db.collection('events')

    // sync_state is keyed per (network, address). We store the key in `artifact_id`
    // because the legacy unique index is on that field — a synthetic per-address id
    // keeps every address's cursor distinct without a schema migration.
    const syncId = `${this.network}:${address}`

    const syncRecord = await syncStateCollection.findOne({ artifact_id: syncId })
    const fromBlock = syncRecord?.last_block_number ?? defaultStartBlock

    if (fromBlock > latestBlock) {
      logger.info(`Address ${address} is up to date at block ${fromBlock}`)
      return
    }

    const toBlock = Math.min(latestBlock, fromBlock + BLOCK_RANGE) + 1

    const allDecodedEvents: Array<{
      artifact_id: string
      event_type: string
      block_number: number | null
      contract_address: string
      data: Record<string, any>
    }> = []

    // An address only emits its own contract class's events; querying an artifact's
    // event tag that this contract never emits simply returns no logs (cheap + safe).
    for (const artifact of artifacts) {
      for (const [eventName, eventDef] of Object.entries(artifact.events)) {
        const decoded = await getPublicEventsForContract({
          aztecNode,
          eventDef,
          contractAddress: address,
          fromBlock,
          toBlock,
        })
        if (decoded.length > 0) {
          logger.info(
            `Address ${address} — ${decoded.length} "${eventName}" event(s) [${artifact.id}]`,
          )
        }
        for (const event of decoded) {
          allDecodedEvents.push({
            artifact_id: artifact.id,
            event_type: eventName,
            block_number: event.blockNumber,
            contract_address: event.contractAddress,
            data: serializeEventData(event.data) as Record<string, any>,
          })
        }
      }
    }

    if (allDecodedEvents.length > 0) {
      const blockNumbers = allDecodedEvents
        .map((e) => e.block_number)
        .filter((n): n is number => n !== null)
      const timestampMap = await getBlockTimestamps(aztecNode, blockNumbers)

      const ops = allDecodedEvents.map((event) => ({
        updateOne: {
          // Same event in the same block for the same artifact shouldn't be inserted twice.
          filter: {
            artifact_id: event.artifact_id,
            event_type: event.event_type,
            block_number: event.block_number,
            contract_address: event.contract_address,
            data: event.data,
          },
          update: {
            $set: {
              ...event,
              timestamp: timestampMap.get(event.block_number!) ?? Math.floor(Date.now() / 1000),
              indexed_at: new Date(),
            },
          },
          upsert: true,
        },
      }))

      await eventsCollection.bulkWrite(ops)
      logger.info(
        `Address ${address} — stored ${allDecodedEvents.length} event(s) (blocks ${fromBlock}→${toBlock})`,
      )
    } else {
      logger.info(`Address ${address} — no events in blocks ${fromBlock}→${toBlock}`)
    }

    // Always advance the per-address cursor, even when no events were found.
    await syncStateCollection.updateOne(
      { artifact_id: syncId },
      {
        $set: {
          artifact_id: syncId,
          network: this.network,
          contract_address: address,
          last_block_number: toBlock,
          last_indexed_at: new Date(),
        },
      },
      { upsert: true },
    )
  }
}
