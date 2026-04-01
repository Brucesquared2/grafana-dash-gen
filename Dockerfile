# ── Stage 1: build ──────────────────────────────────────────────────────────
FROM node:20-alpine AS build

WORKDIR /app

# Install dependencies first (layer-cached until package files change)
COPY package*.json ./
RUN npm ci

# Copy source and compile TypeScript
COPY tsconfig.build.json tsconfig.json ./
COPY src ./src
RUN npm run build

# ── Stage 2: production ──────────────────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

# Install only production dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled output from the build stage
COPY --from=build /app/grafana ./grafana
COPY index.js ./

# Expose the service port (override with PORT env var)
ENV PORT=3000
EXPOSE 3000

# Health-check — hits the /health endpoint
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost:${PORT}/health || exit 1

# Run the HTTP service
CMD ["node", "grafana/server.js"]
