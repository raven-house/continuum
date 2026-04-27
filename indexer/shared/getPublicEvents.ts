import { type AztecNode } from '@aztec/aztec.js/node'
import { decodeFromAbi } from '@aztec/stdlib/abi'
import { computeLogTag } from '@aztec/stdlib/hash'
import { DomainSeparator } from '@aztec/constants'
import type { ExtendedPublicLog } from '@aztec/stdlib/logs'

export const logPublicEventsFromNode = async ({
  aztecNode,
  fromBlock,
  toBlock,
}: {
  aztecNode: AztecNode
  fromBlock: number
  toBlock: number
}) => {
  const { logs } = await aztecNode.getPublicLogs({
    fromBlock,
    toBlock,
  })
  return logs
}

export const decodeEvents = async <T>(logs: ExtendedPublicLog[], eventMetadataDef: any): Promise<T[]> => {
  const expectedTag = await computeLogTag(eventMetadataDef.eventSelector.toField(), DomainSeparator.EVENT_LOG_TAG)

  const decodedEvents = logs
    .map((log) => {
      const blockNumber = log.id.blockNumber
      const contractAddress = log.log.contractAddress
      try {
        if (!log.log.fields[0].equals(expectedTag)) {
          return undefined
        }

        const eventFields = log.log.getEmittedFieldsWithoutTag()
        const result = decodeFromAbi([eventMetadataDef.abiType], eventFields) as T
        return ({ blockNumber, ...result, contractAddress })
      }
      catch (error) {
        console.error(`Decode events error in block Number ${blockNumber} for contract address ${contractAddress.toString()}`, error);
        return undefined
      }
    })
    .filter((log) => log !== undefined) as T[]
  return decodedEvents
}
