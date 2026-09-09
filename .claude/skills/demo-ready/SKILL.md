---
name: demo-ready
description: The pre-judging verification gate - cold-start test, demo reset check, the infra proof sequence (docker compose, kubectl pods, pod-kill self-heal), validation and security talking points, timed rehearsal, fallback recording, and Q&A prep against the 65-point rubric. Use at feature freeze, before demoing, or when the user asks "are we ready" / "check the demo".
---

# Demo readiness gate

Run this at **16:00**, not 16:50. If something fails here, there is still time to cut it.
Judging starts at 5:00 PM but you may not present until much later — everything must survive an
idle hour and a cold restart.

## Gate 1 — Cold start (the one that saves teams)

Kill everything. Close every terminal. Then, from nothing:

```bash
docker compose down
docker compose up -d
# or, if demoing from Kubernetes:
kubectl -n hack delete -f k8s/ && kubectl apply -f k8s/
```

Open the app and run the **entire** demo path without touching a terminal or fixing anything.
If you had to fix something, it is not ready — fix it and repeat the gate.

## Gate 2 — Demo reset

There must be a one-click or one-command way back to exact demo state. You may demo twice, or after
someone else has clicked around your app. Verify it restores identically.

## Gate 3 — The infra proof sequence (rehearse the exact commands)

Have these in a text file ready to paste — never type them live:

```bash
docker images | grep hack          # containerized
kubectl -n hack get pods           # running on Kubernetes, multiple replicas
kubectl -n hack delete pod <api-pod>
kubectl -n hack get pods           # self-healed  <- THE MOMENT
```

Plus the cloud evidence: the Atlas cluster in the browser, and the GHCR image URL.

## Gate 4 — The two deliberate failure demos

Judges remember these because almost nobody does them:

1. **Validation**: submit a bad value → clean, specific 400. *"Nothing untrusted reaches the database."*
2. **Resilience**: kill the pod → self-heals. *"The second replica served traffic throughout."*

## Gate 5 — Fallback recording

Record the full demo path with Win+G. Save it locally. Test that it plays with sound.
If the live demo dies, you keep talking over the video and lose almost nothing.

## Gate 6 — Timed rehearsal, twice, out loud

Both people speak — "everyone demos" is a ground rule, treat it as scored.

| Time | Who | Content |
|---|---|---|
| 0:00–0:30 | Story | The problem in the judges' own words + what it costs today |
| 0:30–1:00 | Story | "Here's what we built", one sentence, money screen visible |
| 1:00–3:00 | Story | Live demo, one linear path, narrated as a named person |
| 3:00–4:00 | Build | Architecture diagram → Docker → Kubernetes self-heal → guardrails |
| 4:00–4:30 | Both | The impact number · what you cut and why · what 2 more weeks buys |

Must fit the limit with 20% slack. If it overruns, cut content, not speaking pace.

## Gate 7 — Q&A prep (five answers, out loud)

1. Why this stack? — *One language across the stack, so both of us could work anywhere in it under time pressure.*
2. How does it scale? — *Stateless API, so replicas scale horizontally; Atlas handles the data tier.*
3. Where does the data come from in production? — name the real UPS system it would read.
4. What happens when the AI is wrong? — *Schema-validated output, timeout with fallback, human stays in the loop.*
5. What did you cut? — **have a real answer.** *"We cut X to guarantee Y worked"* reads as engineering judgement.

Both of you must be able to answer about **either** half of the codebase — judges score independently
and often ask the quieter teammate.

## Gate 8 — The machine itself

- [ ] Sleep disabled, Focus Assist on, Teams and Slack closed
- [ ] Browser: only the demo tabs, zoom ~125% so judges can read it
- [ ] Terminal font large enough to read from two metres
- [ ] Charger plugged in
- [ ] Repo pushed, `demo-freeze` tag created, entry submitted

## Final scoring sweep

**Business (30):** problem restated in their words · who hurts · before → after · **one memorable
number** · how UPS would deploy it.

**Technical (35):** it runs live · containerized · on Kubernetes with self-healing · cloud database ·
validation demonstrated · security spoken aloud · architecture diagram · one real tradeoff named.

Report which gates passed and which failed. **A failed gate at 16:00 means cut the feature, not fix it.**
