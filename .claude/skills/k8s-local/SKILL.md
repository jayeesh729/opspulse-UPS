---
name: k8s-local
description: Deploy the containerized MERN project to Kubernetes - namespace, Deployments with replicas, Services, Secrets from Atlas connection strings, liveness/readiness probes, resource limits, plus the pod-kill self-healing demo that proves Kubernetes understanding to a judge. Use when the user mentions Kubernetes, k8s, kubectl, pods, manifests, scaling, or needs the Kubernetes requirement demonstrated.
---

# Kubernetes, the hackathon-minimum version

Goal: `kubectl get pods` shows everything Running, and killing a pod heals on camera.
**Target 30 minutes.** Run only after `containerize` passes.

The user is a Kubernetes beginner. The aim is not mastery — it is a correct, defensible deployment
plus one memorable demo moment.

## Step 0 — cluster

Docker Desktop → Settings → Kubernetes → Enable. Gives a one-node cluster and wires up `kubectl`.
Fallback: `kind create cluster --name hack`.

Verify: `kubectl get nodes` → one node `Ready`.

## Step 1 — build tagged images

```bash
docker build -t hack-api:v1 ./api
docker build -t hack-web:v1 ./web
```

**VERIFIED on this machine (9 Sep 2026):** Docker Desktop's kind cluster shares the local image
store, so a locally built image runs in the cluster with no registry and no `kind load` step.
Just set `imagePullPolicy: IfNotPresent` and use an explicit tag (never `:latest`).

If a pod ever does report `ErrImagePull` for an image you built locally, the fallback is
`kind load docker-image hack-api:v1 --name desktop`.

**Point the API at Atlas, not at a Mongo pod.** Running a database in Kubernetes is a real
distraction; using managed Atlas is both faster and the more defensible architecture. It also makes
the Secret below meaningful.

## Step 2 — manifests in k8s/

`k8s/00-namespace.yaml`
```yaml
apiVersion: v1
kind: Namespace
metadata: { name: hack }
```

Secret — **generate it, never commit it:**
```bash
kubectl -n hack create secret generic app-secrets \
  --from-literal=MONGODB_URI="$MONGODB_URI" \
  --from-literal=MODEL_API_KEY="$MODEL_API_KEY" \
  --dry-run=client -o yaml | kubectl apply -f -
```

`k8s/10-api.yaml`
```yaml
apiVersion: apps/v1
kind: Deployment
metadata: { name: api, namespace: hack }
spec:
  replicas: 2
  selector: { matchLabels: { app: api } }
  template:
    metadata: { labels: { app: api } }
    spec:
      containers:
        - name: api
          image: hack-api:v1
          imagePullPolicy: IfNotPresent
          ports: [{ containerPort: 8000 }]
          envFrom: [{ secretRef: { name: app-secrets } }]
          readinessProbe: { httpGet: { path: /health, port: 8000 }, initialDelaySeconds: 3 }
          livenessProbe:  { httpGet: { path: /health, port: 8000 }, initialDelaySeconds: 10 }
          resources:
            requests: { cpu: 100m, memory: 128Mi }
            limits:   { cpu: 500m, memory: 512Mi }
---
apiVersion: v1
kind: Service
metadata: { name: api, namespace: hack }
spec:
  selector: { app: api }
  ports: [{ port: 8000, targetPort: 8000 }]
```

`k8s/20-web.yaml` — same shape, `replicas: 2`, image `hack-web:v1`, port 8080, plus a NodePort so a
browser can reach it:
```yaml
apiVersion: v1
kind: Service
metadata: { name: web, namespace: hack }
spec:
  type: NodePort
  selector: { app: web }
  ports: [{ port: 8080, targetPort: 8080, nodePort: 30080 }]
```

## Step 3 — apply and verify

```bash
kubectl apply -f k8s/
kubectl -n hack get pods -w      # wait for Running
kubectl -n hack get svc
```

Browser → `http://localhost:30080`.

Debug loop when a pod misbehaves:
`kubectl -n hack describe pod <name>` → then `kubectl -n hack logs <name>`.
`CrashLoopBackOff` almost always means the app crashed on boot — read the logs, usually a missing env var.

## Step 4 — THE DEMO MOMENT (rehearse it)

```bash
kubectl -n hack get pods
kubectl -n hack delete pod <one-api-pod>
kubectl -n hack get pods         # replacement already starting
```

Narrate: *"Two replicas behind one service. I delete a pod — the ReplicaSet controller sees actual
replicas drop below desired and schedules a replacement, and the app stayed up because the second
replica kept serving."*

**Get the mechanism right.** It is the ReplicaSet controller reconciling desired vs actual state,
**not** the liveness probe. The liveness probe restarts a container that is wedged but still
running; it plays no part in replacing a deleted pod. Saying "the liveness probe rescheduled it" is
wrong and a technical judge may catch it.

Ten seconds, and it is the most convincing thing a beginner can show a technical judge.

Optional, five more seconds: `kubectl -n hack scale deploy/api --replicas=4`.

## Talking points to bank

replicas and self-healing · liveness vs readiness probes · resource requests and limits ·
secrets injected as env vars rather than baked into images · namespace isolation · NodePort service.

## Limits to admit if asked — this EARNS marks

"Single-node local cluster. Production would be managed control plane (AKS/EKS/GKE), an Ingress with
TLS, HPA for autoscaling, and a real secret store like Key Vault." Knowing the gap between a demo and
production reads as engineering maturity, not as a shortfall.
