# Build stage
FROM oven/bun:1-alpine AS builder

WORKDIR /app

# Install build dependencies for native modules (canvas, etc.)
RUN apk add --no-cache python3 make g++ cairo-dev pango-dev jpeg-dev giflib-dev librsvg-dev

# Copy package files
COPY api/package.json api/bun.lock ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source code
COPY api/ ./

# Production stage
FROM node:20-alpine

WORKDIR /app

# Install curl for healthcheck
RUN apk add --no-cache curl

# Copy dependencies from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Copy source code
COPY --from=builder /app/app.js ./
COPY --from=builder /app/index.js ./
COPY --from=builder /app/plugins ./plugins
COPY --from=builder /app/routes ./routes
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/services ./services

# Environment
ENV NODE_ENV=production

# Expose API port
EXPOSE 3004

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3004/health || exit 1

# Run the API server
CMD ["npm", "run", "start"]
