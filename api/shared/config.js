export const DEFAULT_DB_NAME = 'continuum';
export const DEFAULT_API_HOST = '0.0.0.0';
export const DEFAULT_API_PORT = 3004;

/**
 *
 */
export function getDbName() {
  return process.env.CONTINUUM_DB_NAME || DEFAULT_DB_NAME;
}

/**
 *
 */
export function getApiHost() {
  return process.env.CONTINUUM_API_HOST || DEFAULT_API_HOST;
}

/**
 *
 */
export function getApiPort() {
  return Number(process.env.CONTINUUM_API_PORT || DEFAULT_API_PORT);
}

/**
 *
 */
export function getCorsOrigins() {
  const raw = process.env.CONTINUUM_CORS_ORIGIN || '*';
  if (raw.trim() === '*') {
    return '*';
  }

  return raw
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);
}
