# OpsPulse API - Express (ESM) on Node 22.
# Pinned alpine base, non-root user, no secrets baked in (see .dockerignore).
FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

# Copy the manifest first so the dependency layer is cached across source edits.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Application source. .dockerignore keeps node_modules/ and .env out of this layer.
COPY . .

RUN chown -R node:node /app
USER node

EXPOSE 8000

# Node 22 ships a global fetch, so the probe needs no extra package in the image.
HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:8000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/server.js"]
