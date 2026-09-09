# OpsPulse on Kubernetes

Single-node local cluster (Docker Desktop, kind-based, node `desktop-control-plane`).
Namespace `opspulse`. Two Deployments at 2 replicas each, behind a ClusterIP (`api`)
and a NodePort (`web`).

```
browser :30080 -> Service web (NodePort) -> web pods (nginx :8080)
                                              |  nginx proxies /api
                                              v
                                          Service api (ClusterIP :8000) -> api pods (Express :8000)
                                                                              |
                                                                              v
                                                                        MongoDB Atlas
```

The `api` Service name is load-bearing: nginx proxies `/api` to `http://api:8000`,
which only resolves because the Service is named exactly `api` in this namespace.

## Prerequisites

`kubectl` ships inside Docker Desktop and is not on PATH by default:

```bash
export PATH="/c/Users/lenovo/AppData/Local/Programs/DockerDesktop/resources/bin:$PATH"
kubectl get nodes        # desktop-control-plane   Ready
```

Build the images first (the `containerize` step owns the Dockerfiles):

```bash
docker build -t opspulse-api:v1 ./api
docker build -t opspulse-web:v1 ./web
```

**No registry and no `kind load` needed.** Verified empirically on this machine
(9 Sep 2026): a tag that exists only in the local Docker store and in no registry
was scheduled with `imagePullPolicy: IfNotPresent` and started without `ErrImagePull`.
Docker Desktop's kind cluster shares the local image store. Always use an explicit
tag — `:latest` combined with `IfNotPresent` gives you stale-image confusion.

If a pod ever *does* report `ErrImagePull` for an image you built locally:

```bash
kind load docker-image opspulse-api:v1 --name desktop
```

## Apply order

The numeric prefixes are the order. `kubectl apply -f k8s/` processes the directory
alphabetically, so a single apply already does the right thing — with one exception:
the Secret is not a file, so it has to be created between the namespace and the
Deployments.

```bash
# 1. namespace first -- everything else is namespaced
kubectl apply -f k8s/00-namespace.yaml

# 2. secret before the Deployments: pods that start without it sit in
#    CreateContainerConfigError until it exists
./k8s/secret.sh

# 3. workloads
kubectl apply -f k8s/10-api.yaml
kubectl apply -f k8s/20-web.yaml
```

Once the namespace and secret exist, re-deploys are just:

```bash
kubectl apply -f k8s/
```

### Validate without touching the cluster

```bash
kubectl apply -f k8s/ --dry-run=client     # schema + syntax, works offline
kubectl apply -f k8s/ --dry-run=server     # also runs admission control
```

`--dry-run=server` fails with `namespaces "opspulse" not found` if the namespace
does not exist yet. That is the dry-run chicken-and-egg, not a broken manifest —
create the namespace first, then re-run.

## Verification

```bash
kubectl -n opspulse get pods -o wide       # 2/2 Running for api and web
kubectl -n opspulse get svc                # api ClusterIP:8000, web NodePort 8080:30080
kubectl -n opspulse get deploy             # READY 2/2 on both

# secret is present with 3 keys -- DATA column, never `-o yaml`
kubectl -n opspulse get secret app-secrets

# health through the cluster, not just the container
kubectl -n opspulse exec deploy/web -- wget -qO- http://api:8000/api/health
```

Browser: <http://localhost:30080>

When something is wrong, always in this order:

```bash
kubectl -n opspulse describe pod <name>    # events: scheduling, image, probes, mounts
kubectl -n opspulse logs <name>            # the app's own story
kubectl -n opspulse logs <name> --previous # after a CrashLoopBackOff restart
```

`CrashLoopBackOff` on first deploy is almost always a missing env var — check the
Secret exists and has all 3 keys.

## THE DEMO: pod kill and self-healing

Run this with `watch` in a second terminal if you have one; otherwise `-w` is fine.

```bash
# 1. show the steady state -- two api replicas, both Running
kubectl -n opspulse get pods -l app=api

# 2. capture one pod name and kill it
POD=$(kubectl -n opspulse get pod -l app=api -o jsonpath='{.items[0].metadata.name}')
echo "killing $POD"
kubectl -n opspulse delete pod "$POD"

# 3. watch the replacement get scheduled (Ctrl-C when it reaches Running)
kubectl -n opspulse get pods -l app=api -w

# 4. prove the app never went down -- this keeps returning 200 throughout
kubectl -n opspulse exec deploy/web -- wget -qO- http://api:8000/api/health
```

Optional five-second encore:

```bash
kubectl -n opspulse scale deploy/api --replicas=4
kubectl -n opspulse get pods -l app=api
kubectl -n opspulse scale deploy/api --replicas=2
```

### What to actually say

> "Two replicas behind one Service. I delete a pod — the ReplicaSet controller sees
> that observed replicas dropped to one, below the desired two, and immediately
> creates a replacement. The Service kept routing to the surviving replica the whole
> time, so no request was dropped."

**Say "the ReplicaSet controller", not "the liveness probe".** Deleting a pod is
noticed by the replication controller comparing desired-vs-actual state — that is
the reconciliation loop, the core idea of Kubernetes. The liveness probe does
something different: it restarts the *container in place* when a process is alive
but wedged. A technical judge will notice if you attribute the recovery to the
probe, and getting the distinction right is worth more than the demo itself.

## Design notes worth defending

- **Readiness vs liveness.** Readiness gates whether the Service sends traffic;
  liveness restarts a hung container. Both hit `/api/health`, which the API mounts
  *ahead of* its rate limiter — otherwise Kubernetes could rate-limit itself into
  restarting a perfectly healthy pod.
- **The API listens before Mongo connects.** A transient Atlas blip degrades
  readiness instead of crash-looping the container.
- **Requests vs limits.** Requests (100m/128Mi) are what the scheduler reserves;
  limits (500m/512Mi) are the ceiling. Exceeding the memory limit is an OOMKill,
  exceeding CPU is throttling.
- **Secrets injected as env vars**, never baked into an image or committed. Rotating
  a key is `./secret.sh` plus `kubectl -n opspulse rollout restart deploy/api`.
- **Atlas instead of a Mongo pod.** Running a stateful database in a demo cluster
  costs time and defends poorly; a managed database is the better architecture.
- **`runAsNonRoot` on api, not on web.** The api pod pins `runAsUser: 1000`
  explicitly — `runAsNonRoot` alone cannot be enforced when an image declares a
  named user (`USER node`) rather than a UID, and the kubelet refuses the pod with
  "cannot verify user is non-root". Stock nginx starts its master process as root
  and writes to `/var/cache/nginx`, so `web` gets `allowPrivilegeEscalation: false`
  and `capabilities: drop: [ALL]` but keeps its default user. If the web image is
  built `FROM nginxinc/nginx-unprivileged`, add `runAsNonRoot: true` +
  `runAsUser: 101` to the web pod too.

## Secret handling

`secret.sh` reads `api/.env`, which is gitignored, and applies with
`create --dry-run=client -o yaml | kubectl apply -f -`. That renders the Secret
locally and lets `apply` decide create-vs-update, so re-running after a key rotation
updates in place instead of failing with `AlreadyExists`. The script prints key
*names* only.

Never run `kubectl get secret app-secrets -o yaml` on a shared screen. Base64 is
encoding, not encryption — that output is plaintext to anyone watching. Use the
`DATA` column to confirm the count instead.

Two honest caveats: `--from-literal` puts values in the process argument list, so
they are briefly visible to `ps` on this machine; and Kubernetes Secrets are stored
base64-encoded in etcd, not encrypted at rest by default.

## Limits to admit if a judge asks

Single-node local cluster, so this demonstrates orchestration but not real
availability — one machine is still one failure domain. Production would be a
managed control plane (AKS/EKS/GKE) across zones, an Ingress with TLS instead of a
NodePort, an HPA driving replicas off CPU or latency, a PodDisruptionBudget, and a
real secret store (Key Vault / Secrets Manager) with CSI injection rather than
env-var Secrets. Naming the gap is the point.
