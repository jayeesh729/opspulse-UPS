# OpsPulse web - multi-stage: Node compiles the Vite bundle, nginx ships it.
# The final image contains no source, no node_modules and no build tooling.

# ---- Stage 1: build --------------------------------------------------------
FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---- Stage 2: runtime ------------------------------------------------------
# nginx-unprivileged runs as a non-root user and listens on 8080 by default.
FROM nginxinc/nginx-unprivileged:1.27-alpine

ENV NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1
# Default suits docker compose; Kubernetes overrides it with the service FQDN,
# because nginx resolver does raw DNS and ignores the search-domain list.
ENV API_UPSTREAM=http://api:8000
COPY --chown=nginx:nginx default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build --chown=nginx:nginx /app/dist /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=5 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:8080/ || exit 1
