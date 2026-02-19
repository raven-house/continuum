# Build stage
FROM oven/bun:1 AS builder

WORKDIR /app

# Copy package files
COPY functions/package.json functions/bun.lockb ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source code
COPY functions/ ./

# Production stage
FROM oven/bun:1-slim

WORKDIR /app

# Install necessary packages for native modules
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy dependencies from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Copy source code
COPY --from=builder /app/index.ts ./
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/types ./types
COPY --from=builder /app/logs ./logs

# Create logs directory
RUN mkdir -p /app/logs

# Environment
ENV NODE_ENV=production

# Expose no ports (internal service)

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:9999/health || exit 1

# Run the indexer
CMD ["bun", "run", "index.ts"]
