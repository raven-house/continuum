# Build stage
FROM oven/bun:1 AS builder

WORKDIR /app

# Copy package files
COPY indexer/package.json indexer/bun.lockb ./

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
COPY --from=builder /app/types.d.ts ./
COPY --from=builder /app/artifacts ./artifacts
COPY --from=builder /app/artifacts.json ./artifacts.json

# Create logs directory
RUN mkdir -p /app/logs

# Environment
ENV NODE_ENV=production
ENV CONTINUUM_ARTIFACTS_CONFIG_PATH=/app/artifacts.json

# Run the indexer
CMD ["bun", "run", "start"]
