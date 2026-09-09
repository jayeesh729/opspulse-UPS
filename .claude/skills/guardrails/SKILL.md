---
name: guardrails
description: Add the validation and security layer the judges asked for to a MERN app - Zod request validation, Mongoose schema constraints, helmet security headers, rate limiting, explicit CORS, NoSQL injection sanitizing, secret hygiene, dependency audit, and a prompt-injection guard on LLM inputs - plus the 60-second security script to say during the demo. Use for validation, security, hardening, "guardrails", input checking, or securing the API.
---

# Validation & security guardrails

**Target 25 minutes for the code, 5 minutes to rehearse the script.** The organisers' own technology
slide lists "Guardrails: Security handling", so these are points they have explicitly told you they
are looking for — and most teams will skip them entirely.

## Part 1 — Validation, two layers (this is the story)

**Layer A: at the edge, with Zod.** Nothing untrusted reaches business logic.

```js
import { z } from "zod";

const ShipmentSchema = z.object({
  trackingId: z.string().regex(/^1Z[0-9A-Z]{16}$/, "must be a valid 1Z tracking number"),
  weightKg:   z.number().positive().max(70),
  destination:z.string().min(3).max(120).trim(),
});

const validate = (schema) => (req, res, next) => {
  const r = schema.safeParse(req.body);
  if (!r.success) {
    return res.status(400).json({
      error: "Validation failed",
      details: r.error.issues.map(i => ({ field: i.path.join("."), message: i.message })),
    });
  }
  req.body = r.data;          // parsed + coerced, never the raw input
  next();
};

app.post("/api/shipments", validate(ShipmentSchema), handler);
```

**Layer B: at the data layer, with Mongoose** — `required`, `min`/`max`, `enum`, `match`, `unique`.
So even a bug in a route cannot write a malformed document.

Say: *"Validation at the edge and again at the data layer — defence in depth."*

**Build one deliberate demo moment**: submit an obviously bad value (negative weight, junk tracking
ID) and show the clean, specific 400 instead of a stack trace. Ten seconds, and it demonstrates
validation better than any slide.

## Part 2 — Security middleware (10 lines, big talking points)

```bash
npm i helmet express-rate-limit cors express-mongo-sanitize dotenv
```

```js
app.use(helmet());                                   // security headers
app.use(mongoSanitize());                            // strips $ and . -> blocks NoSQL injection
app.use(cors({ origin: process.env.WEB_ORIGIN }));   // explicit origin, never "*"
app.use(rateLimit({ windowMs: 60_000, max: 60 }));   // basic abuse protection
app.use(express.json({ limit: "100kb" }));           // payload cap -> DoS protection
```

`express-mongo-sanitize` is the one to emphasise — **NoSQL injection is the MongoDB-specific risk**,
and knowing that specifically is what separates you from a team that just said "we added helmet".

## Part 3 — Secret hygiene

- All secrets in `.env`; `.env` in `.gitignore`; commit a `.env.example` with empty values.
- In Kubernetes they arrive as a Secret via `envFrom` — never baked into the image.
- Run `git log -p | grep -i -E "api[_-]?key|secret|password"` to confirm nothing leaked in history.
- Never log a full request body containing customer data.

## Part 4 — AI guardrails (if the build calls a model)

- **Prompt injection**: user text goes in a clearly delimited block with a system instruction to treat
  it as data, never as instructions. Never concatenate raw user input into a command.
- **Output is untrusted**: validate the model's response against a Zod schema before using it.
  Never `eval` it, never put it straight into the DOM.
- **Timeout + fallback** — 3 seconds, then a cached or stubbed response so the demo cannot hang.
- **PII**: synthetic data only; never send real customer addresses to a third-party model.

## Part 5 — Dependency audit (2 min, strong signal)

```bash
npm audit --omit=dev
```

Fix what's trivial; be ready to say what you left and why. *"We audited dependencies and there are no
high-severity issues in the production tree"* is a sentence very few hackathon teams can say.

## The 60-second security script (rehearse this)

> "Guardrails were part of the brief, so we treated them as a feature. Input is validated twice —
> Zod at the API edge and schema constraints at the data layer — so malformed data can't reach the
> database. We sanitize against NoSQL injection, which is the specific risk with MongoDB. Helmet sets
> security headers, CORS is pinned to one origin rather than a wildcard, and the API is rate limited.
> No secrets are in the repo or the images — they're injected as Kubernetes Secrets at runtime. The
> containers run as non-root. And everything you see is synthetic data; no real customer PII touches
> the model endpoint."

## Verify

- A bad request returns a clean, specific 400 — not a 500 and not a stack trace.
- `curl` past the rate limit returns 429.
- `grep -r "api_key\|secret" --exclude-dir=node_modules .` finds nothing real.
- The app still fully works after all of it — hardening that breaks the demo is worse than none.
