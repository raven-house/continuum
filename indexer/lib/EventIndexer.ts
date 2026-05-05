import path from 'path'
import { ArtifactRegistry, type LoadedArtifact } from './ArtifactRegistry'
import { logPublicEventsFromNode, decodeEvents } from '../shared/getPublicEvents'
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

    // artifacts.json lives at the root of the project; in Docker it's mounted at /app/artifacts.json
    const configPath =
      process.env.CONTINUUM_ARTIFACTS_CONFIG_PATH ??
      path.resolve(process.cwd(), 'artifacts.json')

    this.registry = new ArtifactRegistry(configPath)
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

    const artifacts = await this.registry.getEnabledArtifacts(this.network)
    if (artifacts.length === 0) {
      logger.info(`No enabled artifacts for network "${this.network}"`)
      return
    }

    // Each artifact is indexed independently so one failure doesn't block others
    await Promise.all(
      artifacts.map((artifact) => this.indexArtifact(artifact, aztecNode, latestBlock))
    )
  }

  private async indexArtifact(
    artifact: LoadedArtifact,
    aztecNode: any,
    latestBlock: number
  ): Promise<void> {
    const db = mongodbConnection.getDb()
    const syncStateCollection = db.collection('sync_state')
    const eventsCollection = db.collection('events')

    // Look up where we left off for this artifact on this network
    const syncRecord = await syncStateCollection.findOne({
      artifact_id: artifact.id,
      network: this.network,
    })
    const fromBlock = syncRecord?.last_block_number ?? artifact.startBlock

    if (fromBlock > latestBlock) {
      logger.info(`Artifact "${artifact.id}" is up to date at block ${fromBlock}`)
      return
    }

    const toBlock = Math.min(latestBlock, fromBlock + BLOCK_RANGE) + 1

    logger.info(
      `Artifact "${artifact.id}" — indexing blocks ${fromBlock}→${toBlock} (${Object.keys(artifact.events).join(', ')})`
    )

    // Fetch all public logs for the block range in one call
    const logs = await logPublicEventsFromNode({ aztecNode, fromBlock, toBlock })
    console.log("logs", logs)

    // Decode every configured event type
    const allDecodedEvents: Array<{
      artifact_id: string
      event_type: string
      block_number: number | null
      contract_address: string  // comes from the event itself — each deployment has its own address
      data: Record<string, any>
    }> = []

    for (const [eventName, eventDef] of Object.entries(artifact.events)) {
      const decoded = await decodeEvents(logs, eventDef)
      console.log(`Decoded ${decoded.length} "${eventName}" events for artifact "${artifact.id}"`)
      for (const event of decoded) {
        allDecodedEvents.push({
          artifact_id: artifact.id,
          event_type: eventName,
          block_number: event.blockNumber,
          contract_address: event.contractAddress?.toString(),
          data: stripMeta(event),
        })
      }
    }

    // Fetch block timestamps only for blocks that actually have events
    if (allDecodedEvents.length > 0) {
      const blockNumbers = allDecodedEvents
        .map((e) => e.block_number)
        .filter((n): n is number => n !== null)
      const timestampMap = await getBlockTimestamps(aztecNode, blockNumbers)

      const ops = allDecodedEvents.map((event) => ({
        updateOne: {
          // Unique key: same event in same block for same artifact shouldn't be inserted twice
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
        `Artifact "${artifact.id}" — stored ${allDecodedEvents.length} events (blocks ${fromBlock}→${toBlock})`
      )
    } else {
      logger.info(
        `Artifact "${artifact.id}" — no events in blocks ${fromBlock}→${toBlock}`
      )
    }

    // Always advance the sync state, even if no events were found
    await syncStateCollection.updateOne(
      { artifact_id: artifact.id, network: this.network },
      {
        $set: {
          artifact_id: artifact.id,
          network: this.network,
          last_block_number: toBlock,
          last_indexed_at: new Date(),
        },
      },
      { upsert: true }
    )
  }
}

// blockNumber and contractAddress are stored as top-level fields, not inside data.
// serializeEventData converts Aztec SDK types (AztecAddress, Fr, BigInt) to plain strings.
function stripMeta(event: Record<string, any>): Record<string, any> {
  const { blockNumber, contractAddress, ...data } = event
  return serializeEventData(data) as Record<string, any>
}
