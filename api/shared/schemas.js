export const addressPattern = '^0x[0-9a-fA-F]{40}$';
export const aztecAddressPattern = '^0x[0-9a-fA-F]{64}$';

const schemas = Object.freeze({
  address: {
    $id: 'eth-address',
    type: 'string',
    pattern: addressPattern
  },
  aztecAddress: {
    $id: 'aztec-address',
    type: 'string',
    pattern: aztecAddressPattern
  }
});

export default schemas;
