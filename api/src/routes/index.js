import { Router } from 'express';
import { z } from 'zod';
import { Site, Standard, Operation, Workforce } from '../models/index.js';
import { FUNCTIONS, SITES, SHIFTS, SCENARIOS, ROLES, OEI_WEIGHTS } from '../config.js';
import { buildForecast, backtest, detectAnomalies } from '../engine/forecast.js';
import { computeKpis, buildAlerts } from '../engine/kpis.js';
import { buildWorkforcePlan, planSummary } from '../engine/workforce.js';
import { optimise } from '../engine/optimize.js';
import { isoDate } from '../util/date.js';
import { validate } from '../middleware/validate.js';
import { wrap } from '../middleware/async.js';
import { requireAuth, requireSiteAccess, requireReset } from '../middleware/auth.js';
import { seedDatabase } from '../data/seed.js';
import { explainPlan } from '../services/narrative.js';

const router = Router();

// Everything below this line requires a valid signed token.
router.use(requireAuth);

const siteCode = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, 'must be a 3-letter site code');
const fnType = z.enum(FUNCTIONS);

const siteQuery = z.object({
  site: siteCode,
  days: z.coerce.number().int().min(7).max(120).default(30),
});

const forecastQuery = z.object({
  site: siteCode,
  function: fnType,
  horizon: z.coerce.number().int().min(1).max(30).default(14),
});

const planQuery = z.object({
  site: siteCode,
  scenario: z.coerce.number().min(0.5).max(2.5).default(1),
  days: z.coerce.number().int().min(7).max(120).default(30),
});

/** Loads everything a site view needs in one round trip. */
async function loadSite(site, days) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const [ops, standards, workforce] = await Promise.all([
    Operation.find({ siteCode: site, date: { $gte: since } }).sort({ date: 1 }).lean(),
    Standard.find({ siteCode: site }).lean(),
    Workforce.find({ siteCode: site }).lean(),
  ]);
  const standardsByFunction = Object.fromEntries(standards.map((s) => [s.functionType, s]));
  return { ops, standardsByFunction, workforce };
}

/** Next-day forecast volume per function - the input to workforce planning. */
async function nextDayForecast(site) {
  const ops = await Operation.find({ siteCode: site }).sort({ date: 1 }).lean();
  const out = {};
  for (const fn of FUNCTIONS) {
    const series = ops.filter((o) => o.functionType === fn);
    const f = buildForecast(series, 1);
    out[fn] = f.length ? f[0].units : 0;
  }
  return out;
}

router.get('/health', (req, res) => res.json({ status: 'ok', service: 'opspulse-api' }));

router.get('/meta', (req, res) =>
  res.json({
    functions: FUNCTIONS,
    shifts: SHIFTS,
    scenarios: SCENARIOS,
    roles: Object.entries(ROLES).map(([key, v]) => ({ key, ...v })),
    oeiWeights: OEI_WEIGHTS,
    sites: (req.user.sites ?? []).length ? SITES.filter((s) => req.user.sites.includes(s.code)) : SITES,
    currentUser: { username: req.user.sub, name: req.user.name, role: req.user.role },
    currentRole: { key: req.user.role, ...req.perms },
    privacyNote: 'All metrics are aggregated at site, function and shift level. No individual employee data is collected or stored.',
  })
);

router.get('/sites', wrap(async (req, res) => {
  const scope = req.user.sites ?? [];
  const filter = scope.length ? { code: { $in: scope } } : {};
  const sites = await Site.find(filter).sort({ code: 1 }).lean();
  res.json(sites.map(({ code, name, region }) => ({ code, name, region })));
}));

router.get('/kpis', validate(siteQuery), requireSiteAccess, wrap(async (req, res) => {
  const { site, days } = req.validated;
  const { ops, standardsByFunction } = await loadSite(site, days);
  if (!ops.length) return res.status(404).json({ error: 'No data', detail: `No operations found for site ${site}` });
  res.json(computeKpis(ops, standardsByFunction));
}));

router.get('/forecast', validate(forecastQuery), requireSiteAccess, wrap(async (req, res) => {
  const { site, function: fn, horizon } = req.validated;
  const series = await Operation.find({ siteCode: site, functionType: fn }).sort({ date: 1 }).lean();
  if (!series.length) return res.status(404).json({ error: 'No data', detail: `No history for ${site}/${fn}` });

  res.json({
    site,
    functionType: fn,
    history: series.slice(-45).map((r) => ({ date: isoDate(r.date), units: r.units })),
    forecast: buildForecast(series, horizon),
    accuracy: backtest(series),
    anomalies: detectAnomalies(series),
  });
}));

router.get('/workforce-plan', validate(planQuery), requireSiteAccess, wrap(async (req, res) => {
  const { site, scenario } = req.validated;
  const [{ standardsByFunction, workforce }, forecastByFunction] = await Promise.all([
    loadSite(site, 30),
    nextDayForecast(site),
  ]);
  const plan = buildWorkforcePlan({ forecastByFunction, standardsByFunction, workforce, scenario });
  res.json({ site, scenario, plan, summary: planSummary(plan) });
}));

router.get('/optimize', validate(planQuery), requireSiteAccess, wrap(async (req, res) => {
  const { site, scenario } = req.validated;
  const [{ standardsByFunction, workforce }, forecastByFunction] = await Promise.all([
    loadSite(site, 30),
    nextDayForecast(site),
  ]);
  const plan = buildWorkforcePlan({ forecastByFunction, standardsByFunction, workforce, scenario });
  res.json({ site, scenario, ...optimise(plan) });
}));

/** One call powering the whole dashboard - fewer round trips, faster demo. */
router.get('/overview', validate(planQuery), requireSiteAccess, wrap(async (req, res) => {
  const { site, scenario, days } = req.validated;
  const [{ ops, standardsByFunction, workforce }, forecastByFunction] = await Promise.all([
    loadSite(site, days),
    nextDayForecast(site),
  ]);
  if (!ops.length) return res.status(404).json({ error: 'No data', detail: `No operations found for site ${site}` });

  const kpis = computeKpis(ops, standardsByFunction);
  const plan = buildWorkforcePlan({ forecastByFunction, standardsByFunction, workforce, scenario });
  const optimisation = optimise(plan);

  res.json({
    site,
    scenario,
    kpis,
    plan,
    summary: planSummary(plan),
    optimisation,
    alerts: buildAlerts(kpis, plan),
    forecastByFunction,
  });
}));

router.post('/explain', wrap(async (req, res) => {
  const schema = z.object({
    site: siteCode,
    scenario: z.coerce.number().min(0.5).max(2.5).default(1),
  });
  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Validation failed',
      details: parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    });
  }
  const { site, scenario } = parsed.data;
  const scope = req.user.sites ?? [];
  if (scope.length && !scope.includes(site)) {
    return res.status(403).json({ error: 'Forbidden', detail: `Your account has access to ${scope.join(', ')} only.` });
  }
  const [{ ops, standardsByFunction, workforce }, forecastByFunction] = await Promise.all([
    loadSite(site, 30),
    nextDayForecast(site),
  ]);
  const kpis = computeKpis(ops, standardsByFunction);
  const plan = buildWorkforcePlan({ forecastByFunction, standardsByFunction, workforce, scenario });
  const optimisation = optimise(plan);
  res.json(await explainPlan({ site, scenario, kpis, plan, optimisation }));
}));

router.post('/admin/reset-demo', requireReset, wrap(async (req, res) => {
  const result = await seedDatabase();
  res.json({ ok: true, ...result });
}));

export default router;
