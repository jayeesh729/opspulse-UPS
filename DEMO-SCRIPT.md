# OpsPulse — Demo Script

**Both of you speak.** "Everyone builds and everyone demos" is a stated ground rule — treat it as
scored. Person A owns the story, Person B owns the build. Rehearse twice, timed.

Before you start: browser at 125% zoom, only demo tabs open, Focus Assist on, Teams closed,
terminal font large enough to read from two metres.

## Pre-demo setup — run these, in order

```bash
export PATH="/c/Users/lenovo/AppData/Local/Programs/DockerDesktop/resources/bin:$PATH"
cd /e/UPS
docker compose up -d                                        # app demo on :3000
kubectl -n opspulse get pods                                # should be 4/4 Running
kubectl -n opspulse port-forward svc/web 30080:8080 &       # k8s access on :30080
```

**Demo the app from `http://localhost:3000` (docker compose), not from :30080.**

Compose is the stable path — no port-forward to die mid-sentence. Use Kubernetes for the *proof*
(`kubectl get pods`, the pod-kill, the in-cluster health check). If you also want to show the app
served from the cluster, :30080 works, but treat it as a bonus.

**Why port-forward and not the NodePort?** Worth knowing, because a judge may ask. Docker Desktop
provisions Kubernetes via kind, so the node is itself a container that publishes no ports to
Windows. The NodePort service is correct and works *inside* the node — verified — but is unreachable
from the host. Port-forward is the standard local workaround. On a managed cluster you would use an
Ingress with TLS instead.

---

## 0:00–0:30 · The hook — Person A

> "UPS operations leaders can't answer three questions: how much work is coming tomorrow, how many
> people that needs, and where their people are in the wrong place today. The brief calls it a
> *lack of a measurable yardstick* — planning is reactive, and staffing is educated guesswork.
>
> We built OpsPulse. It answers all three from one pipeline."

Don't say "dashboard". Say **operating model**.

## 0:30–1:00 · What we built — Person A

Open on the **Operations Dashboard**, Chennai hub.

> "The brief's first challenge was that there's no yardstick. So we built one and named it — the
> Operational Efficiency Index. Chennai is at **87**.
>
> And we never show it as a black box. Throughput against the engineered standard, utilisation,
> on-time throughput — all three components, always visible, so a manager can argue with the number
> instead of just being handed it."

Point at the three function cards: inbound 85, inventory 94, outbound 85.

## 1:00–2:00 · Forecasting — Person A

Click **Volume Forecasting**.

> "Fourteen-day projection. Solid line is history, dashed is forecast, and the shaded band is the
> 95% confidence interval — which widens the further out we look, because pretending otherwise
> would be dishonest."

Scroll to the accuracy card. **This is the credibility moment — slow down here.**

> "We don't just assert the forecast, we measure it. We hide the last fourteen days, forecast them,
> and compare. **8.9% mean absolute error against a seasonal-naive baseline's 15.9%** — 44% less
> error. On a 10,000-parcel day we're typically within 900.
>
> That's seasonal decomposition with Holt's linear trend — not a trained model. With 120 days of
> history a neural net isn't justified, and a manager defending a roster cut needs a forecast they
> can explain. We chose explainable over marginally more accurate, deliberately."

Point at the anomaly panel.

> "It also flags days more than 2.5 standard deviations off expectation — the volume surge on the
> 29th was caught automatically."

## 2:00–3:00 · The finding — Person A

Click **Workforce Planning**.

> "This is the chain a labour planner actually uses. Forecast units, divided by the engineered
> standard, gives productive hours. Divided by target utilisation gives paid hours. Divided by shift
> length and uplifted for absenteeism gives headcount.
>
> Now look at the net position. **174 rostered against 176 required.** Chennai is basically
> balanced — they are *not* short of people."

Point at the utilisation column. **This is the punchline of the whole demo.**

> "But outbound evening is running at **114% utilisation** while inbound sits at **65%**. The
> problem was never headcount. It's distribution."

Click **Resource Optimisation**.

> "Fifteen people, moved within their existing shifts, to areas they're already cross-trained for.
> **840 person-hours a week reclaimed at one hub. Across four hubs, roughly 3,000 — with zero
> hiring.**
>
> And it's honest about limits: seven positions still can't be covered, so it says so and quantifies
> the overtime. Plus four idle inventory staff who aren't certified for outbound — cross-training
> them unlocks another 224 hours a week. That's capacity UPS already pays for and can't legally
> deploy."

## 3:00–3:30 · The wow — Person A

Drag the scenario slider to **Peak season**.

> "Peak season, plus 40%. Everything recomputes — forecast, headcount, gaps, recommendations.
>
> And notice it changes its *answer*, not just its numbers. At normal volume it says redistribute.
> At peak it says redistribution can't help because every area is short — you need 4,032 overtime
> hours a week, or 72 temporary hires, and here's the priority order. That's the actual decision an
> operations leader has to make."

## 3:30–4:30 · Under the hood — Person B

> "React and TypeScript on the front end, Express on the API, MongoDB Atlas as a managed cloud
> database. Containerised, running on Kubernetes."

Show the architecture diagram in the README, then the terminal:

```bash
kubectl -n opspulse get pods
kubectl -n opspulse delete pod <an-api-pod>
kubectl -n opspulse get pods
```

> "Two replicas behind one service. I delete a pod — the ReplicaSet controller sees actual replicas
> drop below desired and schedules a replacement immediately, and the app never went down because
> the second replica kept serving. The liveness probe is a different mechanism: that restarts a
> container that's wedged but still running. Both are configured; this is the controller."

**Say it that way.** The lazy version — "the liveness probe noticed and rescheduled it" — is wrong,
and a technical judge may well catch it. A deleted pod is replaced by the ReplicaSet controller
reconciling desired against actual state. Knowing the difference is exactly the kind of detail that
separates a real answer from a memorised one.

Then guardrails — **say all of this, it's on their own technology slide and few teams will claim it:**

> "Guardrails were part of the brief, so we treated them as a feature. Validation twice — Zod at the
> API edge, schema constraints at the data layer — so malformed data can't reach the database."

Show it live:
```bash
curl "http://localhost:8000/api/forecast?site=MAA&horizon=999"
curl "http://localhost:8000/api/overview?site\[\$ne\]=null"
```

> "Field-level errors, not stack traces. The second one is a NoSQL injection attempt — blocked by
> strict typing and mongo-sanitize. Helmet sets security headers, CORS is pinned to one origin, the
> API is rate limited. No secrets in the repo or the images — they're injected as Kubernetes
> Secrets. Containers run as non-root. And we have a passing test suite over the calculation engine,
> because the maths is the product."

Then the line that matters most:

> "One thing we want to call out. Page two of the brief says this tool is **not** intended to
> evaluate individual employee productivity. So there is no employee entity anywhere in our schema.
> Every metric aggregates at site, function and shift level. That's enforced by the data model, not
> promised in a policy."

## 4:30–5:00 · Close — Both

> "So: one pipeline, four modules. A named yardstick where the brief said there wasn't one. A
> forecast we measured instead of asserting. And a finding that matters — Chennai doesn't need more
> people, it needs them in the right place, and that's 3,000 person-hours a week across four hubs.
>
> With two more weeks: real UPS volume feeds instead of synthetic data, per-site labour standards
> tuned from actuals, and shift-level intraday curves instead of a fixed split."

---

## Q&A — rehearse these five out loud

**Why this stack, given your slide lists Spring Boot?**
> "React and TypeScript are on your approved list. We chose Node for the API because one language
> across the stack let two people work anywhere in it under an eight-hour clock. Portability comes
> from the architecture, not the language — it's API-first with a Zod-validated contract, containerised,
> on Kubernetes, against managed cloud Mongo. Porting the service to Spring Boot is mechanical."

**How does it scale?**
> "The API is stateless, so replicas scale horizontally — that's why it's two pods behind a service
> rather than one. Atlas handles the data tier. The engine functions are pure, so they'd move to a
> scheduled job or a queue worker unchanged."

**Where does the data come from in production?**
> "Scan events from the hub WMS for volumes, the timekeeping system for labour hours, and the roster
> system for available headcount. All three exist — the gap the brief describes is that nobody joins
> them into a single yardstick."

**What if the forecast is wrong?**
> "We publish the error rather than hiding it — 8.9% MAPE, backtested. The confidence band is shown,
> not just the point estimate. And a manager overrides the recommendation; the tool advises, it
> doesn't roster."

**What did you cut?**
> "Authentication. Authorisation is real and enforced server-side by role, but identity is stubbed
> behind a switcher — in production this sits behind UPS SSO with OIDC claims. We cut it because a
> login page earns nothing and would have cost us the optimisation engine. We'd rather show you four
> working modules than five half-working ones."

## Limits — say these before you're asked

Single-node Kubernetes cluster; production wants a managed control plane, Ingress with TLS, HPA and
a real secret store. Data is synthetic. Fixed intraday shift split rather than a real curve.
Volume-weighted OEI hides variance within a function.

**Naming your own limits reads as engineering judgement. Being caught not knowing them doesn't.**
