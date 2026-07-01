# Build stage
FROM oven/bun:1 AS builder

WORKDIR /app

# Copy package files
COPY indexer/package.json indexer/bun.lock ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source code
COPY indexer/ ./

# Production stage
FROM oven/bun:1

WORKDIR /app

# Copy dependencies from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Copy source code
COPY --from=builder /app/index.ts ./
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/shared ./shared

# Environment
ENV NODE_ENV=production
ENV CONTINUUM_INDEXER_HEALTH_PORT=8080

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD ["bun", "-e", "fetch('http://localhost:8080/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"]

# Run the indexer
CMD ["bun", "run", "start"]
