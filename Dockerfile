# Multi-stage security-hardened Dockerfile for Styx WhatsApp Connector
FROM node:20-alpine AS base

# Install necessary runtime packages
RUN apk add --no-cache dumb-init git ffmpeg

WORKDIR /app

# Ensure non-root node user permissions
RUN mkdir -p /app/.auth_session && \
    chown -R node:node /app && \
    chmod 700 /app/.auth_session

# Install dependencies first for efficient layer caching
COPY --chown=node:node package*.json ./
USER node
RUN npm ci --omit=dev

# Copy application source code
COPY --chown=node:node src/ ./src/
COPY --chown=node:node bin/ ./bin/

# Default environment configurations
ENV NODE_ENV=production \
    WHATSAPP_MODE=mock \
    WHATSAPP_AUTH_DIR=/app/.auth_session \
    HTTP_PORT=8765 \
    HTTP_HOST=0.0.0.0 \
    LOG_LEVEL=info

EXPOSE 8765

HEALTHCHECK --interval=20s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8765/health || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/index.js", "daemon"]
