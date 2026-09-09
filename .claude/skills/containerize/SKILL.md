---
name: containerize
description: Containerize the MERN hackathon project with Docker - Dockerfiles for an Express/Node API and a React (Vite) frontend, a docker-compose.yml with MongoDB, .dockerignore files, and container security hardening (non-root user, pinned alpine base images, no baked-in secrets, healthchecks). Use when the user says containerize, dockerize, "add Docker", "docker compose", or needs the whole app to start with one command.
---

# Containerize the project (MERN)

Goal: `docker compose up` starts web + api + mongo. **Target 25 minutes.** Docker is a scored
requirement — bank it at hour 2, never at hour 7.

The user is a Docker beginner but strong in Node/React. Explain each file in one plain sentence,
then move on. No lectures.

## Layout assumed

```
api/    Express, src/server.js, package.json
web/    Vite + React
docker-compose.yml
```

## Step 1 — api/Dockerfile

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN chown -R node:node /app
USER node
EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=3s --retries=3 \
  CMD node -e "fetch('http://localhost:8000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","src/server.js"]
```

Four things to say to a judge: **pinned** version (not `latest`), **alpine** (small attack surface),
runs as the **non-root** `node` user, has a **healthcheck**. Free technical-execution marks.

The API needs `GET /health` returning `{status:"ok"}` — add it now; Kubernetes probes need it too.

## Step 2 — web/Dockerfile (multi-stage)

```dockerfile
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
```

Say: **multi-stage** — Node compiles, but the shipped image is a tiny nginx with no build tools and
no source code in it. `nginx-unprivileged` runs as non-root out of the box.

## Step 3 — .dockerignore in BOTH folders

```
node_modules
dist
.env
.git
*.log
```

Say: keeps secrets and junk out of the image. `.env` on this list is a **security** talking point.

## Step 4 — docker-compose.yml at the repo root

```yaml
services:
  mongo:
    image: mongo:7
    volumes: [mongodata:/data/db]
    restart: unless-stopped
  api:
    build: ./api
    ports: ["8000:8000"]
    environment:
      - MONGODB_URI=mongodb://mongo:27017/hack
      - MODEL_API_KEY=${MODEL_API_KEY}
    depends_on: [mongo]
    restart: unless-stopped
  web:
    build: ./web
    ports: ["3000:8080"]
    depends_on: [api]
    restart: unless-stopped
volumes:
  mongodata: {}
```

Secrets come from a **gitignored `.env`** next to this file — never hardcoded. Local Mongo for dev
speed; the cloud Atlas connection string swaps in via the same env var.

## Step 5 — verify (do not skip)

```bash
docker compose build
docker compose up -d
curl http://localhost:8000/health
docker compose ps            # all healthy
docker compose logs api --tail 20
```

Then prove reproducibility: `docker compose down && docker compose up -d`, hit both URLs again.
If that passes, the cold-start demo risk is basically gone.

## If disk fills up

**Docker's disk image must stay on C: (the SSD).** E: is a mechanical HDD and Kubernetes' etcd
fails to init on it. To reclaim space run `docker system prune -af` between builds, and move
*user files* (Downloads, Pictures) to E: rather than moving Docker.

## Common beginner errors

- Frontend calling `localhost:8000` from inside a container — inside compose the API is `http://api:8000`.
- `npm ci` failing — the folder needs a committed `package-lock.json`.
- Port already taken — `docker compose down` first, or change the host-side port.

## Hand back

Report both URLs, `docker images` sizes, and the four talking points. Then suggest `k8s-local`.
