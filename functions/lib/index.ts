import logger from '../shared/logger'
import ListingCreatedStore from './ListingCreatedStore'
import { getAztecNode } from '../shared/aztecNode'
import { decodeEvents, logPublicEventsFromNode } from '../shared/getPublicEvents'
import { getBlockTimestamps } from '../shared/utils'
import { NFTContract } from '../../artifacts/NFT'
// import { NFTVoucherContract } from '../../artifacts/NFTVoucher'
import ListingCancelledStore from './ListingCancelledStore'
import ListingSoldStore from './ListingSoldStore'
import NFTTTransferStore from './NFTTTransferStore'
import OfferCreatedStore from './OfferCreatedStore'
import { NFTEscrowContract } from '../../artifacts/NFTEscrow'
import OfferAcceptedStore from './OfferAcceptedStore'
import OfferCancelledStore from './OfferCancelledStore'
import MetadataUpdateStore from './ MetadataUpdateStore'
import VoucherClaimedStore from './VouchereClaimedStore'
import { DEVNET, SANDBOX, TESTNET } from '../../aztec-config'

export const BLOCK_RANGE = 14


export async function handler(mode: string) {
  const config =
    (mode === 'TESTNET'
      ? TESTNET
      : mode === 'DEVNET'
        ? DEVNET
        : SANDBOX) || SANDBOX
  logger.info(`Node Url and mode %s, %s`, config.network.nodeUrl, mode)

  const listingCreatedStore = new ListingCreatedStore(mode)
  const listingCancelledStore = new ListingCancelledStore(mode)
  const listingSoldStore = new ListingSoldStore(mode)
  const nftTransferStore = new NFTTTransferStore(mode)
  const offerCreatedStore = new OfferCreatedStore(mode)
  const offerAcceptedStore = new OfferAcceptedStore(mode)
  const offerCancelledStore = new OfferCancelledStore(mode)
  const metadataUpdateStore = new MetadataUpdateStore(mode)
  const voucherClaimedStore = new VoucherClaimedStore(mode)

  const aztecNode = await getAztecNode(config.network.nodeUrl, mode)

  try {
    let lastIndexed = (await listingCreatedStore.getLastIndexedBlockNumber(mode)) || 0
    let fromBlock = lastIndexed
    let latestBlock = await aztecNode.getBlockNumber()
    console.log(`latest block for mode ${mode} is ${latestBlock}`)

    // CRITICAL: Check if we're trying to process blocks that don't exist yet
    if (fromBlock > latestBlock) {
      logger.info(
        `No new blocks to process. LastIndexed: ${lastIndexed}, PXE Latest: ${latestBlock}, mode: ${mode}, fromBlock: ${fromBlock}`
      )
      return
    }

    console.log('fromblock', fromBlock)
    console.log('latestblock', latestBlock)

    // Only Process 5 blocks at a time (inclusive range)
    let toBlock = Math.min(latestBlock, fromBlock + BLOCK_RANGE) + 1

    logger.info(
      `Block status - LastIndexed: ${lastIndexed}, PXE Latest: ${latestBlock}, Processing: ${fromBlock} to ${toBlock}, Mode: ${mode}`
    )

    const logs = await logPublicEventsFromNode({
      aztecNode,
      fromBlock,
      toBlock,
    })

    const listingCreatedEvents = decodeEvents(logs, NFTEscrowContract.events.ListingCreated)
    const listingSoldEvents = decodeEvents(logs, NFTEscrowContract.events.ListingSold)
    const listingCancelledEvents = decodeEvents(logs, NFTEscrowContract.events.ListingCancelled)
    const metadataUpdateEvents = decodeEvents(logs, NFTContract.events.MetadataUpdate)
    const nftTransferEvents = decodeEvents(logs, NFTContract.events.NFTTransfer)
    const offerCreatedEvents = decodeEvents(logs, NFTEscrowContract.events.OfferCreated)
    const offerAcceptedEvents = decodeEvents(logs, NFTEscrowContract.events.OfferAccepted)
    const offerCancelledEvents = decodeEvents(logs, NFTEscrowContract.events.OfferCancelled)
    // const voucherClaimedEvents = decodeEvents(logs, NFTVoucherContract.events.VoucherClaimed)
    // const metadataUpdateVoucherEvents = decodeEvents(logs, NFTVoucherContract.events.MetadataUpdate)

    // Collect all unique block numbers from events
    const allBlockNumbers = [
      ...listingCreatedEvents.map((e) => e.blockNumber),
      ...listingSoldEvents.map((e) => e.blockNumber),
      ...listingCancelledEvents.map((e) => e.blockNumber),
      ...metadataUpdateEvents.map((e) => e.blockNumber),
      ...nftTransferEvents.map((e) => e.blockNumber),
      ...offerCreatedEvents.map((e) => e.blockNumber),
      ...offerAcceptedEvents.map((e) => e.blockNumber),
      ...offerCancelledEvents.map((e) => e.blockNumber),
    ]

    // Fetch timestamps for all unique block numbers
    const timestampMap = await getBlockTimestamps(aztecNode, allBlockNumbers)

    // console.log({
    //   listingCreatedEvents: listingCreatedEvents.length,
    //   listingSoldEvents: listingSoldEvents.length,
    //   listingCancelledEvents: listingCancelledEvents.length,
    //   nftTransferEvents: nftTransferEvents.length,
    //   offerCreatedEvents: offerCreatedEvents.length,
    //   offerAcceptedEvents: offerAcceptedEvents.length,
    //   offerCancelledEvents: offerCancelledEvents.length,
    // })
    const totalEvents =
      listingCreatedEvents.length +
      listingSoldEvents.length +
      listingCancelledEvents.length +
      nftTransferEvents.length +
      offerCreatedEvents.length +
      offerAcceptedEvents.length +
      offerCancelledEvents.length +
      metadataUpdateEvents.length
    // voucherClaimedEvents.length +
    // metadataUpdateVoucherEvents.length

    logger.info(
      `Found events in blocks ${fromBlock}-${toBlock}: Created: ${listingCreatedEvents.length}, Sold: ${listingSoldEvents.length}, Cancelled: ${listingCancelledEvents.length}, Transfer: ${nftTransferEvents.length}, OfferCreated: ${offerCreatedEvents.length}, OfferAccepted: ${offerAcceptedEvents}, OfferCancelled: ${offerCancelledEvents} MeatdataUpdate: ${metadataUpdateEvents.length} Total: ${totalEvents} `
    )

    // Process events in parallel for better performance
    const promises = []

    if (listingCreatedEvents.length > 0) {
      const events = listingCreatedEvents.map((event) => ({
        token_id: Number(event.token_id),
        seller: event.seller.toString(),
        price: event.price.toString(),
        nft_contract: event.nft_contract.toString(),
        offer_contract: event.contractAddress.toString(),
        blockNumber: event.blockNumber,
        timestamp: timestampMap.get(event.blockNumber) ?? Math.floor(Date.now() / 1000),
      }))
      promises.push(listingCreatedStore.addEvents(events))
      logger.info(`Processing ${listingCreatedEvents.length} ListingCreated events`)
    }

    if (listingCancelledEvents.length > 0) {
      const events = listingCancelledEvents.map((event) => ({
        token_id: Number(event.token_id),
        seller: event.seller.toString(),
        nft_contract: event.nft_contract.toString(),
        offer_contract: event.contractAddress.toString(),
        blockNumber: event.blockNumber,
        timestamp: timestampMap.get(event.blockNumber) ?? Math.floor(Date.now() / 1000),
      }))
      promises.push(listingCancelledStore.addEvents(events))
      logger.info(`Processing ${listingCancelledEvents.length} ListingCancelled events`)
    }

    if (listingSoldEvents.length > 0) {
      const events = listingSoldEvents.map((event) => ({
        token_id: Number(event.token_id),
        seller: event.seller.toString(),
        buyer: event.buyer.toString(),
        nft_contract: event.nft_contract.toString(),
        offer_contract: event.contractAddress.toString(),
        blockNumber: event.blockNumber,
        timestamp: timestampMap.get(event.blockNumber) ?? Math.floor(Date.now() / 1000),
        price: event.price,
      }))
      promises.push(listingSoldStore.addEvents(events))
      logger.info(`Processing ${listingSoldEvents.length} ListingSold events`)
    }

    if (nftTransferEvents.length > 0) {
      const events = nftTransferEvents.map((event) => ({
        token_id: Number(event.token_id),
        from: event.from.toString(),
        to: event.to.toString(),
        nft_contract: event.contractAddress.toString(),
        blockNumber: event.blockNumber,
        timestamp: timestampMap.get(event.blockNumber) ?? Math.floor(Date.now() / 1000),
      }))

      promises.push(nftTransferStore.addEvents(events))
      logger.info(`Processing ${nftTransferEvents.length} NFTTransfer events`)
    }

    if (offerCreatedEvents.length > 0) {
      const events = offerCreatedEvents.map((event) => ({
        offer_id: Number(event.offer_id),
        nft_contract: event.nft_contract.toString(),
        token_id: Number(event.token_id),
        buyer: event.buyer.toString(),
        amount: Number(event.amount),
        expiry_block: Number(event.expiry_block),
        blockNumber: event.blockNumber,
        timestamp: timestampMap.get(event.blockNumber) ?? Math.floor(Date.now() / 1000),
        offer_contract: event.contractAddress.toString(),
      }))

      promises.push(offerCreatedStore.addEvents(events))
      logger.info(`Processing ${offerCreatedEvents.length} OfferCreated events`)
    }

    if (offerAcceptedEvents.length > 0) {
      const events = offerAcceptedEvents.map((event) => ({
        offer_id: Number(event.offer_id),
        nft_contract: event.nft_contract.toString(),
        token_id: Number(event.token_id),
        buyer: event.buyer.toString(),
        seller: event.seller.toString(),
        amount: Number(event.amount),
        blockNumber: event.blockNumber,
        timestamp: timestampMap.get(event.blockNumber) ?? Math.floor(Date.now() / 1000),
        offer_contract: event.contractAddress.toString(),
      }))

      promises.push(offerAcceptedStore.addEvents(events))
      logger.info(`Processing ${offerAcceptedEvents.length} OfferAccepted events`)
    }

    if (offerCancelledEvents.length > 0) {
      const events = offerCancelledEvents.map((event) => ({
        offer_id: Number(event.offer_id),
        nft_contract: event.nft_contract.toString(),
        token_id: Number(event.token_id),
        buyer: event.buyer.toString(),
        amount: Number(event.amount),
        blockNumber: event.blockNumber,
        timestamp: timestampMap.get(event.blockNumber) ?? Math.floor(Date.now() / 1000),
        offer_contract: event.contractAddress.toString(),
      }))

      promises.push(offerCancelledStore.addEvents(events))
      logger.info(`Processing ${offerCancelledEvents.length} OfferCancelled events`)
    }

    if (metadataUpdateEvents.length > 0) {
      const events = metadataUpdateEvents.map((event) => ({
        token_id: Number(event.token_id),
        nft_contract: event.contractAddress.toString(),
        owner: event.owner.toString(),
        blockNumber: event.blockNumber,
        timestamp: timestampMap.get(event.blockNumber) ?? Math.floor(Date.now() / 1000),
      }))

      promises.push(metadataUpdateStore.addEvents(events))
      logger.info(`Processing ${metadataUpdateEvents.length} MetadataUpdate events`)
    }

    // if (voucherClaimedEvents.length > 0) {
    //   const events = voucherClaimedEvents.map((event) => ({
    //     token_id: Number(event.token_id),
    //     claimer: event.claimer.toString(),
    //     amount: Number(event.amount),
    //     collection_address: event.collection.toString(),
    //   }))

    //   promises.push(voucherClaimedStore.addEvents(events))
    //   logger.info(`Processing ${voucherClaimedEvents.length} VoucherClaimed events`)
    // }

    // if (metadataUpdateVoucherEvents.length > 0) {
    //   const events = metadataUpdateVoucherEvents.map((event) => ({
    //     token_id: Number(event.token_id),
    //     nft_contract: event.contractAddress.toString(),
    //     owner: event.owner.toString(),
    //     blockNumber: event.blockNumber,
    //   }))

    //   promises.push(metadataUpdateStore.addEvents(events))
    //   logger.info(`Processing ${metadataUpdateVoucherEvents.length} MetadataUpdate events`)
    // }

    // Wait for all database operations to complete
    await Promise.all(promises)

    // ALWAYS update indexed block number after successful processing
    // (even if no events were found - we still processed those blocks)
    await listingCreatedStore.setLastIndexedBlockNumber(mode, toBlock)
    logger.info(
      `Successfully processed blocks ${fromBlock} to ${toBlock} for mode ${mode}. Found ${totalEvents} total events. Updated indexed block to ${toBlock}`
    )
  } catch (error) {
    logger.error(`Error processing blocks for mode ${mode}: ${error}`)
    // Don't update block number on error - we'll retry these blocks next time
    throw error
  }
}
