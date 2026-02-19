import pino from 'pino';

export default pino(
  Object.assign(
    { level: process.env.RD_LOG_LEVEL || 'info' },
    process.env.IS_LOCAL === 'true'
      ? {
        transport: {
          target: 'pino-pretty'
        }
      }
      : null
  )
);
