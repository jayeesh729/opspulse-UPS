# UPS Hackathon — Build-Day Battle Plan (v2: MERN + infra)

## Context

UPS Graduate Hiring 2026 hackathon: 8 hours, teams of two, problem statement revealed at kickoff.
Placing well makes you interview-eligible. The goal is not "a cool project" — it is **maximising a
65-point score from two judges who score independently after watching many demos in a row.**

Organisers have since added four required elements: **cloud, Kubernetes, Docker, validation and
security.** That changes the shape of the day — see §3 and §4.

| Slide fact | What it forces |
|---|---|
| **35 pts Technical Execution** — "Does the prototype work, and is the build sound?" | 54% of the score is *does it run*. A small working thing beats a big broken thing. This governs everything. |
| **30 pts Business** — "Is the idea received properly, and does it land?" | Points are for *reception*, not novelty. Clarity and one number beat cleverness. |
| **Two judges, scoring independently** | One leans business, one technical. Split the narration deliberately. |
| **"Everyone builds and everyone demos"** | Both speak. Treat as scored, not optional. |
| **Judging runs *from* 5:00 PM** | You may present at 5:00 or 6:30. Must survive an idle hour and a cold restart. |
| **Required: Docker · Kubernetes · cloud · validation · security** | ~1.5 hours of the day. Bank it *early*, never at hour 7. |
| Rails: API-first, synthetic datasets, hosted model endpoints, vector search | Use them — it signals you read the brief. |
| Ground rules: approved WiFi only · **mobile not allowed** · BYOD/BYOL | No mobile app. **Assume the network is hostile — demo locally.** |
| Approved design tools: Draw.io, **Mermaid** | They want an architecture diagram. Cheap points. |

---

## 1. Before kickoff

Everything in **[SETUP-TONIGHT.md](SETUP-TONIGHT.md)** must be green: WSL2, Docker Desktop (disk image
on **C:, the SSD** — E: is an HDD and breaks Kubernetes), Kubernetes enabled, `kubectl`, `gh`,
MongoDB Atlas M0 cluster, warmed caches.

**Team split — agree in the first 90 seconds.** Two people, five seats:

| Seat | Owner |
|---|---|
| Frontend + Design & Story | Whoever is faster in React |
| Backend + Data & AI | The other one |
| Team Lead | Whoever is better at saying *no* — owns the clock and the submission |

Both demo. The UI person tells the story; the backend person shows the build.

**Ask at kickoff:** does UPS issue cloud accounts? Does "mobile not allowed" mean no phones, or no
mobile-app submissions? Is Node/Express acceptable given the slide lists TypeScript?

---

## 2. The 30-minute idea lock (hard stop)

Capture the statement **verbatim** — judges score against their words, so reuse their vocabulary.

Generate 3 candidates, score each in 5 minutes:

1. **One screen flow?** If it needs three screens to show value, cut it.
2. **Is there a number?** "Cuts 14 minutes per route" is remembered; "improves efficiency" is not.
3. **Can it fail gracefully live?** No live external APIs, no hardware, no real-time streaming.
4. **Does it ride the provided rails?** Synthetic data + model endpoint + vector search.
5. **Wow moment inside 60 seconds?**

**Hard reject:** mobile apps · real UPS data · training a model from scratch · hardware · blockchain ·
auth and user accounts · anything whose demo depends on the network.

**Gate:** before any code, write (a) a one-sentence pitch and (b) a sketch of the final demo
screenshot. Cannot draw the money screenshot → wrong idea, pick another.

### Pre-loaded idea shapes

- **Control tower / exception triage** — flag at-risk shipments, rank by impact, model explains *why*.
- **RAG over policy/tariff/SOP docs** — with citations. Lowest risk; Atlas Vector Search does the work.
- **Address & data quality** — normalise messy addresses, confidence-score, propose fixes.
- **Route re-sequencing** — before/after map + a saved-minutes number.
- **Claims / damage triage** — classify, auto-draft the response, route it.
- **Hub volume forecast → staffing recommendation.** A recommendation beats a chart.

---

## 3. Locked stack — MERN

You know React, JavaScript, Node, Express and Mongo. **Use them.** Learning a new language while also
learning Docker and Kubernetes is three unknowns at once, and 35 of 65 points are "does it run".
TypeScript is on the approved language list and "any open source" is a ground rule, so Node/Express
is defensible — confirm at kickoff anyway.

| Layer | Choice | Why |
|---|---|---|
| Frontend | React + Vite (TS template — free typing, no extra work) | You're fastest here |
| Backend | Node + Express | Same language, no context switching |
| Database | **MongoDB Atlas M0** (free cloud) | Satisfies the *cloud* requirement in 5 minutes |
| Vector search | **Atlas Vector Search** | Native — no Python, no FAISS |
| Validation | **Zod** at the edge + Mongoose schema at the data layer | Two-layer defence story |
| Security | helmet · rate-limit · CORS · mongo-sanitize · Secrets | Explicitly on their slide |
| Containers | Docker + docker compose | Required |
| Orchestration | Docker Desktop Kubernetes | Required |
| Diagram | Mermaid in the README | Approved tool, cheap points |

**Four rules that protect the demo**

1. **The demo runs locally.** Cloud is *evidence*, not the demo path. WiFi dies; no hotspot rescue.
2. **Agree the JSON contract before either of you writes code.** Integration insurance.
3. **Build a `reset-demo` endpoint.** You may demo twice, or after an idle hour.
4. **Cache model responses on the demo path**; 3-second timeout → stub.

Commit every 30 minutes. Tag `demo-freeze` when you stop.

---

## 4. The clock

Anchored on judging at 5:00 PM; shift if kickoff differs. **Be honest about this: infra eats ~1.5
hours, so you have roughly 2.5 hours of actual feature time. Scope accordingly — one feature done
well, not three half-done.**

| Time | Block | Gate |
|---|---|---|
| 9:00–9:30 | Kickoff. Both listen. Capture wording verbatim. Ask the three questions. | Statement written word for word |
| 9:30–10:00 | **Idea lock.** 3 candidates → score → pick. Pitch + demo sketch on paper. | Nothing starts before the sketch |
| 10:00–10:20 | Repo, README with pitch, **API contract agreed**, data shape decided. | Both agree the JSON |
| 10:20–11:15 | **Walking skeleton** — React → Express → Atlas → renders on screen. Stub the logic. | **Hard gate: runs end to end, or cut scope now** |
| 11:15–11:45 | `/containerize` → `docker compose up` works. | **Docker banked** |
| 11:45–12:15 | `/k8s-local` → pods Running, self-heal rehearsed. | **Kubernetes banked** |
| 12:15–13:00 | Core feature #1 — the thing the demo hinges on. Real logic replaces the stub. | Feature #1 demoable |
| 13:00–13:30 | Lunch. Say the pitch out loud — free rehearsal #0. | |
| 13:30–14:30 | Core feature #2 + the AI/data differentiator. | |
| 14:30–15:00 | `/guardrails` → Zod, helmet, rate limit, sanitize, secrets. | **Validation + security banked** |
| 15:00–15:20 | `/cloud-deploy` → GHCR push, Atlas verified, Mermaid diagram. | **Cloud banked** |
| 15:20–15:40 | **Feature freeze.** Not working = cut, not fixed. Write the cut list. | Written cut list |
| 15:40–16:00 | Polish the demo path only: seed data, empty/loading states, one chart. | |
| 16:00–16:40 | `/demo-ready` → all 8 gates, rehearse twice timed, record fallback. | **Cold start passes** |
| 16:40–17:00 | Buffer. Submit. Cold dry-run on the presenting machine. | Runs from cold |
| 17:00 | Judging. Keep it running; be ready to re-demo. | |

**The three gates that are non-negotiable: 11:15 (skeleton runs), 12:15 (infra banked), 15:20 (freeze).**

---

## 5. Demo script — both speak

| Time | Who | Content |
|---|---|---|
| 0:00–0:30 | Story | The problem in the judges' own words + what it costs today |
| 0:30–1:00 | Story | "Here's what we built", one sentence, money screen on screen |
| 1:00–3:00 | Story | Live demo, one linear path, narrated as a named person: *"Priya, a hub supervisor, opens her shift at 6am and sees…"* |
| 3:00–4:00 | Build | Mermaid diagram → `docker compose` → `kubectl get pods` → **kill a pod, it self-heals** → the guardrails script |
| 4:00–4:30 | Both | The impact number · what you cut and why · what 2 more weeks buys |

**Two deliberate failure demos** almost nobody does — submit bad input, get a clean 400; kill a pod,
watch it heal. Ten seconds each, and they prove validation and orchestration better than any slide.

---

## 6. Risk register

| Risk | Mitigation |
|---|---|
| Venue WiFi dies mid-demo | Everything local; cached model responses; recorded fallback video |
| C: fills up mid-build | `docker system prune -af`. **Never move Docker's disk image to E:** — it is an HDD and breaks Kubernetes |
| Kubernetes eats an hour | Timeboxed to 30 min; if it fails, demo `docker compose` and *say* what you'd do |
| Cloud deploy eats the afternoon | Layers 1–2 only (Atlas + GHCR). Layer 3 timeboxed to 15 min, abandon freely |
| Scope creep | 15:20 freeze is absolute. Cut list written, not debated |
| Merge conflict at hour 7 | Integrate at 11:15; small commits; never both in one file |
| Judge asks the quiet teammate | Both walk the whole codebase at 16:00 |

---

## 7. Skills available (type the slash command)

| Skill | When | Does |
|---|---|---|
| `/containerize` | 11:15 | Dockerfiles, compose, hardening, verification |
| `/k8s-local` | 11:45 | Manifests, probes, secrets, the self-heal demo |
| `/guardrails` | 14:30 | Zod, helmet, rate limit, sanitize, the 60-second security script |
| `/cloud-deploy` | 15:00 | Atlas, GHCR, optional live URL, Mermaid diagram |
| `/demo-ready` | 16:00 | 8 readiness gates, rehearsal, Q&A prep |
| `/security-review` | anytime | Built-in — reviews your diff for real vulnerabilities |

---

## When the problem statement drops

1. Write it down **verbatim**.
2. Run §2 against the real wording — 3 candidates, five tests, pick one.
3. Paste it here and we build.

**Two things decide your score:** something that *runs* at 5:00 PM, and a story a non-technical judge
repeats correctly afterwards. Everything else here exists to protect those two.
