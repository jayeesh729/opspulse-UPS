import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import { buildWorkforcePlan, planSummary, SHIFT_HOURS } from '../src/engine/workforce.js';
import { buildForecast } from '../src/engine/forecast.js';
import { generateOperations, generateWorkforce } from '../src/data/generate.js';
import { STANDARDS, SITES, FUNCTIONS, SHIFTS, SCENARIOS } from '../src/config.js';

const OPS = generateOperations();
const WORKFORCE = generateWorkforce(OPS);

/** The next-day forecast per function, exactly as routes/index.js builds it. */
function forecastFor(site) {
  const out = {};
  for (const fn of FUNCTIONS) {
    const f = buildForecast(OPS.filter((o) => o.siteCode === site && o.functionType === fn), 1);
    out[fn] = f.length ? f[0].units : 0;
  }
  return out;
}

const planFor = (site, scenario = 1) =>
  buildWorkforcePlan({
    forecastByFunction: forecastFor(site),
    standardsByFunction: STANDARDS,
    workforce: WORKFORCE.filter((w) => w.siteCode === site),
    scenario,
  });

const SITE_CODES = SITES.map((s) => s.code);

describe('buildWorkforcePlan', () => {
  test('produces one row per function per shift', () => {
    const rows = planFor('MAA');
    assert.equal(rows.length, FUNCTIONS.length * SHIFTS.length);
    for (const fn of FUNCTIONS) {
      for (const shift of SHIFTS) {
        assert.ok(rows.some((r) => r.functionType === fn && r.shift === shift.name), `missing ${fn}/${shift.name}`);
      }
    }
  });

  test('gap is always available minus required', () => {
    for (const site of SITE_CODES) {
      for (const s of SCENARIOS) {
        for (const r of planFor(site, s.multiplier)) {
          assert.equal(r.gap, r.available - r.required, `${site} ${s.key} ${r.functionType}/${r.shift}`);
        }
      }
    }
  });

  test('required is never below one, even for negligible volume', () => {
    const rows = buildWorkforcePlan({
      forecastByFunction: { inbound: 1 },
      standardsByFunction: STANDARDS,
      workforce: [],
      scenario: 1,
    });
    for (const r of rows) assert.equal(r.required, 1, `${r.shift}`);
  });

  test('required follows the documented labour chain', () => {
    // 10 000 units/day, inbound (45 u/ph, 85% target utilisation, 8% absenteeism),
    // Morning shift takes 40% of the volume over 8 hours:
    //   4000 units -> 88.89 productive h -> 104.58 paid h -> 13.07 heads -> x1.08 -> 15
    const rows = buildWorkforcePlan({
      forecastByFunction: { inbound: 10000 },
      standardsByFunction: STANDARDS,
      workforce: [],
      scenario: 1,
    });
    const morning = rows.find((r) => r.shift === 'Morning');
    assert.equal(morning.forecastUnits, 4000);
    assert.equal(morning.productiveHours, 88.9);
    assert.equal(morning.paidHours, 104.6);
    assert.equal(morning.required, 15);
  });

  test('required is monotonically non-decreasing as the scenario multiplier rises', () => {
    for (const site of SITE_CODES) {
      let previous = null;
      // 0.5 .. 2.5 in 0.05 steps - the range routes/index.js accepts.
      for (let step = 10; step <= 50; step++) {
        const scenario = step / 20;
        const rows = planFor(site, scenario);
        if (previous) {
          rows.forEach((r, i) => {
            const before = previous.rows[i];
            assert.equal(r.functionType, before.functionType);
            assert.equal(r.shift, before.shift);
            assert.ok(
              r.required >= before.required,
              `${site} ${r.functionType}/${r.shift}: required fell from ${before.required} ` +
                `at scenario ${previous.scenario} to ${r.required} at scenario ${scenario}`
            );
          });
        }
        previous = { rows, scenario };
      }
    }
  });

  test('a peak scenario needs strictly more people than a low one', () => {
    for (const site of SITE_CODES) {
      const low = planSummary(planFor(site, 0.8)).required;
      const peak = planSummary(planFor(site, 1.4)).required;
      assert.ok(peak > low, `${site}: peak ${peak} not above low ${low}`);
    }
  });

  test('forecast volume is split across shifts by the configured shares', () => {
    const daily = 10000;
    const rows = buildWorkforcePlan({
      forecastByFunction: { inbound: daily },
      standardsByFunction: STANDARDS,
      workforce: [],
      scenario: 1.4,
    });
    const total = rows.reduce((a, r) => a + r.forecastUnits, 0);
    assert.ok(Math.abs(total - daily * 1.4) <= SHIFTS.length, `shift shares do not sum to the daily forecast (${total})`);
    for (const shift of SHIFTS) {
      const r = rows.find((x) => x.shift === shift.name);
      assert.equal(r.forecastUnits, Math.round(daily * shift.share * 1.4), shift.name);
    }
  });

  test('a function with no engineered standard is skipped rather than producing NaN', () => {
    const rows = buildWorkforcePlan({
      forecastByFunction: { inbound: 5000, mystery: 5000 },
      standardsByFunction: STANDARDS,
      workforce: [],
      scenario: 1,
    });
    assert.ok(!rows.some((r) => r.functionType === 'mystery'));
    assert.equal(rows.length, SHIFTS.length);
  });

  test('a missing workforce pool means zero available and no skills', () => {
    const rows = buildWorkforcePlan({
      forecastByFunction: { inbound: 5000 },
      standardsByFunction: STANDARDS,
      workforce: [],
      scenario: 1,
    });
    for (const r of rows) {
      assert.equal(r.available, 0);
      assert.deepEqual(r.skills, []);
      assert.equal(r.utilisationIfUnchanged, 0, 'must not divide by zero headcount');
      assert.ok(r.gap < 0);
    }
  });

  test('every numeric field is finite across every site and scenario', () => {
    for (const site of SITE_CODES) {
      for (const s of SCENARIOS) {
        for (const r of planFor(site, s.multiplier)) {
          for (const [key, value] of Object.entries(r)) {
            if (typeof value === 'number') {
              assert.ok(Number.isFinite(value), `${site} ${s.key} ${r.functionType}/${r.shift}: ${key} is ${value}`);
            }
          }
          assert.ok(Array.isArray(r.skills));
        }
      }
    }
  });

  test('utilisationIfUnchanged is productive hours over rostered paid hours', () => {
    const rows = buildWorkforcePlan({
      forecastByFunction: { inbound: 10000 },
      standardsByFunction: STANDARDS,
      workforce: [{ functionType: 'inbound', shift: 'Morning', availableHeadcount: 20, skills: ['inbound'] }],
      scenario: 1,
    });
    const morning = rows.find((r) => r.shift === 'Morning');
    assert.equal(morning.available, 20);
    assert.equal(morning.utilisationIfUnchanged, Math.round((88.888888 / (20 * SHIFT_HOURS)) * 1000) / 1000);
  });

  test('SHIFT_HOURS matches the shift configuration', () => {
    assert.equal(SHIFT_HOURS, SHIFTS[0].hours);
  });
});

describe('planSummary', () => {
  test('netGap equals available minus required', () => {
    for (const site of SITE_CODES) {
      for (const s of SCENARIOS) {
        const rows = planFor(site, s.multiplier);
        const summary = planSummary(rows);
        assert.equal(summary.netGap, summary.available - summary.required, `${site} ${s.key}`);
      }
    }
  });

  test('required and available are the row totals', () => {
    const rows = planFor('BOM', 1);
    const summary = planSummary(rows);
    assert.equal(summary.required, rows.reduce((a, r) => a + r.required, 0));
    assert.equal(summary.available, rows.reduce((a, r) => a + r.available, 0));
  });

  test('netGap also equals the sum of the per-row gaps', () => {
    for (const site of SITE_CODES) {
      const rows = planFor(site, 1);
      assert.equal(planSummary(rows).netGap, rows.reduce((a, r) => a + r.gap, 0), site);
    }
  });

  test('short and surplus positions reconcile with netGap', () => {
    for (const site of SITE_CODES) {
      for (const s of SCENARIOS) {
        const summary = planSummary(planFor(site, s.multiplier));
        assert.ok(summary.shortPositions >= 0 && summary.surplusPositions >= 0);
        assert.equal(summary.surplusPositions - summary.shortPositions, summary.netGap, `${site} ${s.key}`);
      }
    }
  });

  test('an empty plan summarises to zeros', () => {
    assert.deepEqual(planSummary([]), {
      required: 0,
      available: 0,
      netGap: 0,
      shortPositions: 0,
      surplusPositions: 0,
    });
  });
});
