# Setup Tonight — before the hackathon

Your machine scan:

| Have | Missing (all required tomorrow) |
|---|---|
| git 2.51 · node 24.8 · npm 11.6 · VS Code · Java 20 | **Docker** · **kubectl** · **gh** · cloud CLI |
| python 3.10–3.13 (not needed — you're on MERN) | WSL2 (Docker's engine on Windows) |

**Two blockers to clear first — they can need a reboot, so start now:**

1. **C: is 94% full (16 GB free).** Docker will fill that fast. Free space, and point Docker's disk
   image at `E:\` (105 GB free) the moment it installs — instructions in step 3.
2. **WSL2 looks absent.** Virtualization *is* enabled in your firmware, so it will work — but
   `wsl --install` usually wants a restart. Do it before anything else.

---

## Step 1 — WSL2 (run in an **Administrator** PowerShell, then reboot)

```powershell
wsl --install --no-distribution
```

Reboot when it asks. Skipping the reboot is the #1 cause of "Docker Desktop won't start".

## Step 2 — Install the tools

```powershell
winget install -e --id Docker.DockerDesktop --accept-package-agreements --accept-source-agreements
winget install -e --id Kubernetes.kubectl
winget install -e --id GitHub.cli
```

Then **close and reopen your terminal** so PATH refreshes.

## Step 3 — Docker Desktop first-run (do this immediately after install)

1. Launch Docker Desktop, accept the terms, skip the survey.
2. **Settings → Resources → Advanced → Disk image location → keep it on C: (the SSD).**
   `C:\Users\lenovo\AppData\Local\Docker\wsl` is correct. **Do NOT move it to E:** — E: is a
   mechanical HDD (Toshiba MQ04ABF100) and Kubernetes' etcd times out on spinning disks.
   If C: gets tight, move Downloads/Pictures to E: instead; those don't care about latency.
3. **Settings → Kubernetes → Enable Kubernetes → Apply & Restart.** Takes ~5 minutes on first run.
   This gives you a working cluster *and* wires up `kubectl` — no minikube or kind needed.

## Step 4 — Verify (all five must pass)

```bash
docker --version && docker run --rm hello-world && kubectl get nodes && gh --version && node --version
```

You want: a hello-world container that exits cleanly, and one node showing `Ready`.

## Step 5 — Accounts (free, no credit card)

- [ ] **MongoDB Atlas** — atlas.mongodb.com → create a free **M0** cluster, region closest to you.
      Save the connection string. This is your cloud database *and* your vector search.
      Under Network Access add `0.0.0.0/0` for the hackathon, so venue WiFi can reach it.
- [ ] **GitHub** — `gh auth login` in your terminal. Also gives you free container hosting (GHCR).
- [ ] Confirm you can reach the **UPS internal Git org** and any model endpoint they issued you.

## Step 6 — Warm the caches (saves ~15 min on venue WiFi)

```bash
mkdir -p /c/tmp/warm && cd /c/tmp/warm && npm create vite@latest w -- --template react-ts && cd w && npm install && cd .. && npm i express mongoose zod helmet cors express-rate-limit dotenv && docker pull node:22-alpine && docker pull mongo:7 && docker pull nginxinc/nginx-unprivileged:1.27-alpine
```

Then delete `C:\tmp\warm`. The npm and Docker caches stay behind, and tomorrow's installs are instant.

## Step 7 — The dress rehearsal (the part that actually matters)

Tell me **"run the dress rehearsal"** and we'll build a throwaway hello-world MERN app, containerize
it, deploy it to your local Kubernetes, and kill a pod to watch it self-heal — end to end, tonight.

Tomorrow that becomes a 20-minute copy-paste instead of a four-hour panic. This is learning your
tools, not pre-building the project — exactly what the pre-kickoff slide told you to do.

---

## Physical checklist

- [ ] Laptop charged, charger + adapter packed
- [ ] Sleep disabled, Focus Assist on (no Teams popups during the demo)
- [ ] Win+G (Xbox Game Bar) tested — that's your fallback demo recording
