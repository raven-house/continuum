import { type AztecNode, createAztecNodeClient } from '@aztec/aztec.js/node'
import logger from './logger'

const cache = new Map<string, AztecNode>()

export const getAztecNode = async (nodeUrl: string, mode: string) => {
  const key = mode.toLowerCase()
  if (cache.has(key)) return cache.get(key)!

  logger.info(`Setting up Aztec node client for network: ${key}`)
  const aztecNode = await createAztecNodeClient(nodeUrl)
  cache.set(key, aztecNode)
  return aztecNode
}
