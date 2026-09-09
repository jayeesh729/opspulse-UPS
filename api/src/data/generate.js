import {
  SITES, FUNCTIONS, SHIFTS, STANDARDS, BASE_VOLUME, WEEKDAY_FACTOR, SEED, HISTORY_DAYS,
} from '../config.js';

// Deterministic PRNG so the demo is byte-identical on every reseed.
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rnd) {
  const u = Math.max(rnd(), 1e-9);
  const v = Math.max(rnd(), 1e-9);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

/**
 * Builds `days` of daily history per site per function.
 *
 * The series is deliberately structured rather than random noise, because a forecast
 * is only meaningful if there is real signal to find:
 *   - weekday seasonality (Monday peak, Sunday trough)
 *   - a slow upward trend
 *   - month-end surges
 *   - a peak-season ramp across the final 30 days
 *   - two injected anomaly days, so the alerting has something true to catch
 *
 * Labour hours are DERIVED from units, the engineered standard, and a drifting
 * efficiency factor. That is what makes the efficiency index vary meaningfully
 * instead of sitting flat.
 */
export function generateOperations({ days = HISTORY_DAYS, seed = SEED } = {}) {
  const rnd = mulberry32(seed);
  const rows = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const site of SITES) {
    for (const fn of FUNCTIONS) {
      const base = BASE_VOLUME[site.code][fn];
      const std = STANDARDS[fn];
      // Each site/function starts at a different efficiency and drifts - this is
      // what creates the under- and over-performing areas the optimiser finds.
      let efficiency = 0.78 + rnd() * 0.28;

      for (let i = days - 1; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dow = date.getDay();
        const daysFromStart = days - 1 - i;

        let units = base;
        units *= WEEKDAY_FACTOR[dow];
        units *= 1 + 0.0012 * daysFromStart; // gentle growth

        const dom = date.getDate();
        const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
        if (dom >= lastDay - 2) units *= 1.12; // month-end push

        const intoPeak = daysFromStart - (days - 30);
        if (intoPeak > 0) units *= 1 + 0.35 * (intoPeak / 30); // peak-season ramp

        units *= 1 + gaussian(rnd) * 0.06;

        if (i === 9) units *= 1.55; // injected surge
        if (i === 23) units *= 0.58; // injected disruption

        units = Math.max(50, Math.round(units));

        // Efficiency drifts slowly, and dips when volume spikes beyond comfortable capacity.
        efficiency = clamp(efficiency + gaussian(rnd) * 0.012, 0.7, 1.08);
        const strain = units / (base * WEEKDAY_FACTOR[dow]) > 1.3 ? 0.94 : 1;
        const effToday = clamp(efficiency * strain, 0.6, 1.1);

        const labourHours = units / (std.unitsPerPersonHour * effToday);
        const headcount = Math.max(1, Math.round(labourHours / 8 / std.targetUtilisation));
        const onTimePct = clamp(0.99 - (1 - effToday) * 0.55 + gaussian(rnd) * 0.02, 0.6, 1);

        rows.push({
          siteCode: site.code,
          functionType: fn,
          date,
          units,
          labourHours: Math.round(labourHours * 10) / 10,
          headcount,
          onTimePct: Math.round(onTimePct * 1000) / 1000,
        });
      }
    }
  }
  return rows;
}

export function generateStandards() {
  const out = [];
  for (const site of SITES) {
    for (const fn of FUNCTIONS) out.push({ siteCode: site.code, functionType: fn, ...STANDARDS[fn] });
  }
  return out;
}

/**
 * Available headcount per site / function / shift.
 *
 * Calibrated against RECENT demand (the last 14 days of generated history), not the
 * base volume - otherwise the peak-season ramp leaves every area short and there is
 * no surplus for the optimiser to redistribute.
 *
 * The biases below are chosen so total headcount roughly covers total demand while
 * being badly distributed across areas. That produces the finding that actually
 * matters to an operations leader: *you are not short of people, they are in the
 * wrong place* - which is a far stronger result than "hire more staff".
 *
 * Skills are asymmetric on purpose. Inventory staff hold equipment certification and
 * can cover inbound, but inbound/outbound staff cannot cover inventory. That means
 * some idle capacity is genuinely unreachable, and the optimiser surfaces it as a
 * cross-training opportunity rather than pretending the problem is solved.
 */
export function generateWorkforce(operations, { seed = SEED + 7 } = {}) {
  const rnd = mulberry32(seed);
  const bias = { inbound: 1.26, outbound: 0.78, inventory: 1.16 };
  const out = [];

  // Rosters are built for a busy day, not an average one, so we calibrate against the
  // 90th percentile of the last three weeks rather than the mean. Calibrating to the
  // mean would leave every area short against a Monday peak forecast, and the whole
  // imbalance signal would be swamped by a uniform shortfall.
  const recent = new Map();
  if (operations?.length) {
    const latest = operations.reduce((m, o) => (new Date(o.date) > m ? new Date(o.date) : m), new Date(0));
    const cutoff = new Date(latest);
    cutoff.setDate(cutoff.getDate() - 21);

    const buckets = new Map();
    for (const op of operations) {
      if (new Date(op.date) < cutoff) continue;
      const key = `${op.siteCode}:${op.functionType}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(op.units);
    }
    for (const [key, values] of buckets) {
      values.sort((a, b) => a - b);
      recent.set(key, values[Math.floor(values.length * 0.9)] ?? values[values.length - 1]);
    }
  }

  for (const site of SITES) {
    for (const fn of FUNCTIONS) {
      const std = STANDARDS[fn];
      const daily = recent.get(`${site.code}:${fn}`) ?? BASE_VOLUME[site.code][fn];

      for (const shift of SHIFTS) {
        const shiftUnits = daily * shift.share;
        const fairHeadcount = shiftUnits / std.unitsPerPersonHour / shift.hours / std.targetUtilisation;
        let hc = fairHeadcount * bias[fn] * (0.92 + rnd() * 0.16);
        if (fn === 'outbound' && shift.name === 'Evening') hc *= 0.82; // the pinch point
        out.push({
          siteCode: site.code,
          functionType: fn,
          shift: shift.name,
          availableHeadcount: Math.max(2, Math.round(hc)),
          skills: fn === 'inventory' ? ['inventory', 'inbound'] : ['inbound', 'outbound'],
        });
      }
    }
  }
  return out;
}
