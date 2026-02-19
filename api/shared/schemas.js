export const addressPattern = '^0x[0-9a-fA-F]{40}$';

const schemas = Object.freeze({
  address: {
    $id: 'eth-address',
    type: 'string',
    pattern: addressPattern
  }
});

export default schemas;
