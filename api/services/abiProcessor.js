/**
 * ABI Processor Service
 * 
 * Processes contract ABI JSON to extract events and compute their selectors.
 * Uses Poseidon2 hashing for event selector computation (matching Noir's approach).
 */

import { Barretenberg } from '@aztec/bb.js';

/**
 * Load contract artifact and extract events from outputs.structs.events
 * @param {Object} abiJson - The raw Noir ABI JSON
 * @returns {Object} - The transformed artifact with events
 */
export function loadContractArtifact(abiJson) {
  // The events are typically in outputs.structs.events in Noir ABI
  const events = abiJson.outputs?.structs?.events || 
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
 * Convert ABI type to signature string format
 * @param {Object} type - The ABI type object
 * @returns {string} - The signature type string
 */
function abiTypeToSignatureType(type) {
  if (!type || typeof type !== 'object') {
    return 'Field';
  }

  switch (type.kind) {
    case 'field':
      return 'Field';
    
    case 'boolean':
      return 'bool';
    
    case 'integer':
      return type.sign === 'signed' ? `i${type.width}` : `u${type.width}`;
    
    case 'string':
      return `str<${type.length}>`;
    
    case 'array':
      return `[${abiTypeToSignatureType(type.type)};${type.length}]`;
    
    case 'struct':
      if (!type.fields || !Array.isArray(type.fields)) {
        return '()';
      }
      return `(${type.fields.map(f => abiTypeToSignatureType(f.type)).join(',')})`;
    
    case 'tuple':
      if (!type.fields || !Array.isArray(type.fields)) {
        return '()';
      }
      return `(${type.fields.map(abiTypeToSignatureType).join(',')})`;
    
    default:
      return 'Field';
  }
}

/**
 * Generate event signature string
 * @param {string} name - Event name
 * @param {Array} fields - Event fields
 * @returns {string} - Event signature like "EventName(Field,u32)"
 */
function generateEventSignature(name, fields) {
  if (!fields || !Array.isArray(fields)) {
    return `${name}()`;
  }
  
  const paramTypes = fields.map(f => abiTypeToSignatureType(f.type));
  return `${name}(${paramTypes.join(',')})`;
}

/**
 * Compute Poseidon2 hash of bytes
 * @param {Barretenberg} bb - Barretenberg instance
 * @param {Buffer} data - Data to hash
 * @returns {Promise<Buffer>} - 32-byte hash
 */
async function poseidon2HashBytes(bb, data) {
  // Convert bytes to fields (each field can hold 31 bytes safely)
  const fields = [];
  for (let i = 0; i < data.length; i += 31) {
    const chunk = data.slice(i, i + 31);
    const hex = '0x' + chunk.toString('hex').padStart(64, '0');
    fields.push(BigInt(hex));
  }
  
  // Compute Poseidon2 hash
  const hash = await bb.poseidon2Hash(fields);
  
  // Convert hash to buffer (32 bytes)
  const hashHex = hash.toString(16).padStart(64, '0');
  return Buffer.from(hashHex, 'hex');
}

/**
 * Compute event selector from signature
 * @param {Barretenberg} bb - Barretenberg instance
 * @param {string} signature - Event signature
 * @returns {Promise<string>} - Event selector as hex string (e.g., "0x12345678")
 */
async function computeEventSelector(bb, signature) {
  // Remove whitespace from signature
  const cleanSignature = signature.replace(/\s/g, '');
  
  // Hash the signature using Poseidon2
  const hash = await poseidon2HashBytes(bb, Buffer.from(cleanSignature));
  
  // Take last 4 bytes for selector
  const selectorBytes = hash.slice(-4);
  return '0x' + selectorBytes.toString('hex');
}

/**
 * Process events from contract artifact
 * @param {Array} events - Events array from artifact
 * @returns {Promise<Array>} - Processed events with selectors
 */
async function processEvents(events) {
  if (!events || !Array.isArray(events) || events.length === 0) {
    return [];
  }

  // Initialize Barretenberg for hashing
  let bb;
  try {
    bb = await Barretenberg.new();
    
    const processedEvents = await Promise.all(
      events.map(async (event) => {
        // Extract event name from path (e.g., "contract::MyEvent" -> "MyEvent")
        const eventPath = event.path || '';
        const eventName = eventPath.split('::').pop() || 'UnknownEvent';
        
        // Generate event signature
        const eventSignature = generateEventSignature(eventName, event.fields);
        
        // Compute event selector
        const eventSelector = await computeEventSelector(bb, eventSignature);
        
        // Extract field names
        const fieldNames = (event.fields || []).map(f => f.name);
        
        return {
          name: eventName,
          path: eventPath,
          signature: eventSignature,
          eventSelector: eventSelector.toString(),
          abiType: event,
          fieldNames: fieldNames,
          fieldCount: fieldNames.length
        };
      })
    );
    
    return processedEvents;
  } finally {
    if (bb) {
      await bb.destroy();
    }
  }
}

/**
 * Main function to process contract ABI and extract events
 * @param {Object} abiJson - The contract ABI JSON
 * @returns {Promise<Object>} - Processed contract with events
 */
export async function processContractAbi(abiJson) {
  // Validate input
  if (!abiJson || typeof abiJson !== 'object') {
    throw new Error('Invalid ABI JSON: must be an object');
  }

  // Load artifact
  const artifact = loadContractArtifact(abiJson);
  
  // Extract contract name from various possible locations
  const contractName = abiJson.name || 
                       abiJson.contract_name || 
                       (artifact.outputs?.structs?.events?.[0]?.path?.split('::')[0]) ||
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
 * @param {Object} abiJson - The ABI JSON to validate
 * @returns {Object} - Validation result
 */
export function validateAbi(abiJson) {
  const errors = [];
  
  if (!abiJson || typeof abiJson !== 'object') {
    return { valid: false, errors: ['ABI must be a valid JSON object'] };
  }
  
  // Check for required fields (Noir ABI is flexible, so we just do basic checks)
  if (!abiJson.abi && !abiJson.outputs && !abiJson.file_map) {
    errors.push('ABI appears to be missing standard Noir ABI structure (no abi, outputs, or file_map fields)');
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings: []
  };
}
