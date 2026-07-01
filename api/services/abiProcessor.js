/**
 * ABI Processor Service
 *
 * Processes contract ABI JSON to extract events and compute their selectors.
 * Uses Poseidon2 hashing for event selector computation (matching Noir's approach).
 */

import { decodeFunctionSignature, EventSelector } from '@aztec/stdlib/abi';
import { poseidon2HashBytes } from '@aztec/foundation/crypto/sync';

/**
 * Load contract artifact and extract events from outputs.structs.events
 * @param {object} abiJson - The raw Noir ABI JSON
 * @returns {object} - The transformed artifact with events
 */
export function loadContractArtifact(abiJson) {
  // The events are typically in outputs.structs.events in Noir ABI
  const events =
    abiJson.outputs?.structs?.events ||
    abiJson.abi?.outputs?.structs?.events ||
    [];

  return {
    ...abiJson,
    outputs: {
      ...(abiJson.outputs || {}),
      structs: {
        ...(abiJson.outputs?.structs || {}),
        events
      }
    }
  };
}

/**
 * Process events from contract artifact.
 *
 * The event signature and selector are derived with the SAME aztec primitives the
 * indexer uses (decodeFunctionSignature + EventSelector.fromSignature), so the
 * stored selector matches both the on-chain event tag and what the indexer
 * recomputes from `signature` at load time. EventSelector.fromSignature hashes
 * with the pure-WASM Poseidon2 (no native `bb` binary required).
 * @param {Array} events - Events array from artifact (each is a struct ABI type)
 * @returns {Promise<Array>} - Processed events with selectors
 */
async function processEvents(events) {
  if (!events || !Array.isArray(events) || events.length === 0) {
    return [];
  }

  return Promise.all(
    events.map(async event => {
      // Extract event name from path (e.g., "NFT::Transfer" -> "Transfer")
      const eventPath = event.path || '';
      const eventName = eventPath.split('::').pop() || 'UnknownEvent';

      // Canonical aztec signature, e.g. "Transfer((Field),(Field),Field)"
      const eventSignature = decodeFunctionSignature(
        eventName,
        event.fields || []
      );
      // Selector = last 4 bytes of Poseidon2(signature bytes). This mirrors
      // EventSelector.fromSignature exactly, but with the WASM hash so it works
      // in the bb-less Docker image.
      const hash = poseidon2HashBytes(Buffer.from(eventSignature));
      const eventSelector = EventSelector.fromBuffer(
        hash.toBuffer().subarray(-EventSelector.SIZE)
      ).toString();

      const fieldNames = (event.fields || []).map(f => f.name);

      return {
        name: eventName,
        path: eventPath,
        signature: eventSignature,
        eventSelector,
        abiType: event,
        fieldNames,
        fieldCount: fieldNames.length
      };
    })
  );
}

/**
 * Main function to process contract ABI and extract events
 * @param {object} abiJson - The contract ABI JSON
 * @returns {Promise<object>} - Processed contract with events
 */
export async function processContractAbi(abiJson) {
  // Validate input
  if (!abiJson || typeof abiJson !== 'object') {
    throw new Error('Invalid ABI JSON: must be an object');
  }

  // Load artifact
  const artifact = loadContractArtifact(abiJson);

  // Extract contract name from various possible locations
  const contractName =
    abiJson.name ||
    abiJson.contract_name ||
    artifact.outputs?.structs?.events?.[0]?.path?.split('::')[0] ||
    'UnknownContract';

  // Get events from artifact
  const rawEvents = artifact.outputs?.structs?.events || [];

  // Process events to compute selectors
  const processedEvents = await processEvents(rawEvents);

  return {
    contractName,
    eventCount: processedEvents.length,
    events: processedEvents,
    rawAbi: abiJson,
    processedAt: new Date().toISOString()
  };
}

/**
 * Validate ABI structure
 * @param {object} abiJson - The ABI JSON to validate
 * @returns {object} - Validation result
 */
export function validateAbi(abiJson) {
  const errors = [];

  if (!abiJson || typeof abiJson !== 'object') {
    return { valid: false, errors: ['ABI must be a valid JSON object'] };
  }

  // Check for required fields (Noir ABI is flexible, so we just do basic checks)
  if (!abiJson.abi && !abiJson.outputs && !abiJson.file_map) {
    errors.push(
      'ABI appears to be missing standard Noir ABI structure (no abi, outputs, or file_map fields)'
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings: []
  };
}
