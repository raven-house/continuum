import { type AztecNode } from '@aztec/aztec.js/node'
import { decodeFromAbi, EventSelector } from '@aztec/stdlib/abi'
import { parseBlockNumberFromLog } from './utils'
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

export const decodeEvents = (logs: ExtendedPublicLog[], eventMetadataDef: any) => {
  const decodedEvents = logs
    .map((log) => {
      const blockNumber = parseBlockNumberFromLog(log.toHumanReadable())
      const logFields = log.log.getEmittedFields()
      const contractAddress = log.log.contractAddress
      try {
        if (
          !EventSelector.fromField(logFields[logFields.length - 1]).equals(
            eventMetadataDef.eventSelector
          )
        ) {
          return undefined
        }


        const result = decodeFromAbi([eventMetadataDef.abiType], log.log.fields) as T
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
