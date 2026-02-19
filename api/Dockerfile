# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY api/package.json api/package-lock.json* api/bun.lockb* ./

# Install dependencies (support both npm and bun)
RUN if [ -f bun.lockb ]; then \
        apk add --no-cache curl && \
        curl -fsSL https://bun.sh/install | bash && \
        export PATH="$HOME/.bun/bin:$PATH" && \
        bun install --frozen-lockfile; \
    else \
        npm ci; \
    fi

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
COPY --from=builder /app/scripts ./scripts

# Environment
ENV NODE_ENV=production

# Expose API port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Run the API server
CMD ["npm", "run", "start"]
