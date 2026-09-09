import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import { fitModel, buildForecast, backtest, detectAnomalies } from '../src/engine/forecast.js';
import { generateOperations } from '../src/data/generate.js';
import { SITES, FUNCTIONS, HISTORY_DAYS } from '../src/config.js';

// generateOperations is deterministically seeded (config.SEED), so every assertion
// below against the real series is stable across runs and machines.
const OPS = generateOperations();
const series = (site, fn) => OPS.filter((o) => o.siteCode === site && o.functionType === fn);
const ALL_SERIES = SITES.flatMap((s) => FUNCTIONS.map((f) => ({ label: `${s.code}/${f}`, rows: series(s.code, f) })));

/** yyyy-mm-dd in the LOCAL calendar - the day an operations manager means. */
const localIso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const plusDays = (d, n) => {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
};

/** A perfectly flat series: no trend, no seasonality, no noise. */
function flatSeries(value = 1000, days = 120) {
  const rows = [];
  const start = new Date(2026, 0, 1);
  for (let i = 0; i < days; i++) {
    rows.push({ date: plusDays(start, i), units: value, labourHours: 20, headcount: 3, onTimePct: 0.95 });
  }
  return rows;
}

describe('fitModel', () => {
  test('fits on a trailing 60-day window by default', () => {
    const m = fitModel(series('MAA', 'inbound'));
    assert.equal(m.n, 60);
    assert.equal(m.window.length, 60);
    assert.equal(m.fittedSeasonal.length, 60);
  });

  test('window is the whole history when history is shorter than the window', () => {
    const m = fitModel(flatSeries(500, 20));
    assert.equal(m.n, 20);
  });

  test('level, trend and sigma are always finite numbers', () => {
    for (const { label, rows } of ALL_SERIES) {
      const m = fitModel(rows);
      for (const k of ['level', 'trend', 'sigma']) {
        assert.ok(Number.isFinite(m[k]), `${label}: ${k} is ${m[k]}`);
      }
      assert.ok(m.sigma >= 0, `${label}: sigma must be non-negative`);
    }
  });

  test('project never returns a negative volume', () => {
    const m = fitModel(series('BLR', 'outbound'));
    for (let k = 1; k <= 90; k++) {
      for (let wd = 0; wd < 7; wd++) assert.ok(m.project(k, wd) >= 0);
    }
  });

  test('a flat series produces zero trend and zero residual spread', () => {
    const m = fitModel(flatSeries(1000));
    assert.ok(Math.abs(m.trend) < 1e-9, `trend was ${m.trend}`);
    assert.ok(Math.abs(m.level - 1000) < 1e-9, `level was ${m.level}`);
    assert.ok(m.sigma < 1e-9, `sigma was ${m.sigma}`);
  });

  test('handles an empty history without throwing', () => {
    const m = fitModel([]);
    assert.equal(m.n, 0);
    assert.ok(Number.isFinite(m.sigma));
  });
});

describe('buildForecast', () => {
  test('returns exactly `horizon` points', () => {
    const rows = series('MAA', 'inbound');
    for (const horizon of [1, 3, 7, 14, 30]) {
      assert.equal(buildForecast(rows, horizon).length, horizon, `horizon ${horizon}`);
    }
  });

  test('returns an empty array for an empty history', () => {
    assert.deepEqual(buildForecast([], 14), []);
  });

  test('dates are strictly increasing and one calendar day apart', () => {
    for (const { label, rows } of ALL_SERIES) {
      const f = buildForecast(rows, 30);
      for (let i = 1; i < f.length; i++) {
        assert.ok(f[i].date > f[i - 1].date, `${label}: ${f[i].date} !> ${f[i - 1].date}`);
      }
      // No duplicated or skipped days across the horizon.
      const first = new Date(`${f[0].date}T00:00:00Z`);
      const last = new Date(`${f.at(-1).date}T00:00:00Z`);
      assert.equal((last - first) / 86400000, f.length - 1, `${label}: horizon does not span contiguous days`);
    }
  });

  test('the first forecast day is the calendar day after the last history day', () => {
    // BUG (see report): buildForecast labels points with toISOString().slice(0,10),
    // which is the UTC day. History dates are local midnight, so in any timezone east
    // of UTC every forecast point is labelled one calendar day early - the first
    // forecast point carries the SAME date as the last day of actual history.
    for (const { label, rows } of ALL_SERIES) {
      const lastHistoryDay = new Date(rows.at(-1).date);
      const expected = localIso(plusDays(lastHistoryDay, 1));
      const actual = buildForecast(rows, 14)[0].date;
      assert.equal(
        actual,
        expected,
        `${label}: forecast starts ${actual}, expected ${expected} (last history day ${localIso(lastHistoryDay)}; ` +
          `process UTC offset ${-new Date().getTimezoneOffset()} min)`
      );
    }
  });

  test('lower <= units <= upper at every point', () => {
    for (const { label, rows } of ALL_SERIES) {
      for (const p of buildForecast(rows, 30)) {
        assert.ok(Number.isFinite(p.units) && Number.isFinite(p.lower) && Number.isFinite(p.upper), `${label}: non-finite point`);
        assert.ok(p.lower <= p.units, `${label} ${p.date}: lower ${p.lower} > units ${p.units}`);
        assert.ok(p.units <= p.upper, `${label} ${p.date}: units ${p.units} > upper ${p.upper}`);
        assert.ok(p.lower >= 0, `${label} ${p.date}: lower bound is negative`);
      }
    }
  });

  test('the confidence band widens with the horizon', () => {
    for (const { label, rows } of ALL_SERIES) {
      const f = buildForecast(rows, 30);
      const width = (p) => p.upper - p.lower;
      assert.ok(width(f.at(-1)) > width(f[0]), `${label}: band did not widen (${width(f[0])} -> ${width(f.at(-1))})`);
    }
  });

  test('uncertainty never shrinks as the horizon extends', () => {
    // Measured above the point estimate: the lower bound is deliberately floored at
    // zero (negative volume is meaningless), so on a low-volume Sunday the rendered
    // lower..upper width can shrink even while the underlying uncertainty grows.
    for (const { label, rows } of ALL_SERIES) {
      const f = buildForecast(rows, 30);
      const halfBand = (p) => p.upper - p.units;
      for (let i = 1; i < f.length; i++) {
        assert.ok(halfBand(f[i]) >= halfBand(f[i - 1]), `${label}: uncertainty narrowed at step ${i}`);
      }
      assert.ok(halfBand(f.at(-1)) > halfBand(f[0]), `${label}: uncertainty did not grow across the horizon`);
    }
  });

  test('a perfectly flat series forecasts that same constant with a zero band', () => {
    const f = buildForecast(flatSeries(1000), 14);
    assert.equal(f.length, 14);
    for (const p of f) {
      assert.ok(Math.abs(p.units - 1000) <= 0.5, `expected ~1000, got ${p.units}`);
      assert.ok(Math.abs(p.lower - 1000) <= 0.5, `lower drifted: ${p.lower}`);
      assert.ok(Math.abs(p.upper - 1000) <= 0.5, `upper drifted: ${p.upper}`);
    }
  });

  test('a flat series at a different level also forecasts that constant', () => {
    for (const value of [50, 7500, 123456]) {
      const f = buildForecast(flatSeries(value), 7);
      for (const p of f) assert.ok(Math.abs(p.units - value) <= 0.5, `expected ~${value}, got ${p.units}`);
    }
  });
});

describe('backtest', () => {
  test('returns null when there is not enough history', () => {
    assert.equal(backtest([]), null);
    assert.equal(backtest(flatSeries(1000, 30)), null);
    assert.equal(backtest(flatSeries(1000, 73)), null, '73 rows is one short of holdout(14) + 60');
  });

  test('returns a result once history reaches holdout + 60 days', () => {
    const result = backtest(flatSeries(1000, 74));
    assert.notEqual(result, null);
    assert.equal(result.holdoutDays, 14);
  });

  test('honours a custom holdout length', () => {
    const rows = series('DEL', 'inbound');
    assert.equal(backtest(rows, 7).holdoutDays, 7);
    assert.equal(backtest(rows.slice(0, 66), 7), null);
  });

  test('beats BOTH the naive and the seasonal-naive baseline on every real series', () => {
    for (const { label, rows } of ALL_SERIES) {
      const r = backtest(rows);
      assert.notEqual(r, null, `${label}: expected ${HISTORY_DAYS} days to be enough history`);
      assert.ok(r.mape < r.naiveMape, `${label}: mape ${r.mape} not below naive ${r.naiveMape}`);
      assert.ok(r.mape < r.seasonalNaiveMape, `${label}: mape ${r.mape} not below seasonal-naive ${r.seasonalNaiveMape}`);
      assert.ok(r.improvementPct > 0, `${label}: improvementPct ${r.improvementPct} should be positive`);
    }
  });

  test('all reported error figures are finite and non-negative', () => {
    for (const { label, rows } of ALL_SERIES) {
      const r = backtest(rows);
      for (const k of ['mape', 'naiveMape', 'seasonalNaiveMape', 'improvementPct', 'holdoutDays']) {
        assert.ok(Number.isFinite(r[k]), `${label}: ${k} is ${r[k]}`);
      }
      assert.ok(r.mape >= 0 && r.naiveMape >= 0 && r.seasonalNaiveMape >= 0, `${label}: negative error`);
    }
  });

  test('improvementPct is measured against the STRONGER baseline', () => {
    for (const { rows } of ALL_SERIES) {
      const r = backtest(rows);
      const best = Math.min(r.naiveMape, r.seasonalNaiveMape);
      assert.equal(r.improvementPct, Math.round(((best - r.mape) / best) * 1000) / 10);
    }
  });

  test('a perfectly predictable series is forecast with zero error', () => {
    const r = backtest(flatSeries(1000));
    assert.equal(r.mape, 0);
  });
});

describe('detectAnomalies', () => {
  test('returns nothing when history is too short to model', () => {
    assert.deepEqual(detectAnomalies([]), []);
    assert.deepEqual(detectAnomalies(flatSeries(1000, 59)), []);
  });

  test('returns nothing for a series with no deviation at all', () => {
    assert.deepEqual(detectAnomalies(flatSeries(1000, 120)), []);
  });

  test('finds the injected surge day in every generated series', () => {
    // generate.js multiplies units by 1.55 on the day 9 days before the last day.
    for (const { label, rows } of ALL_SERIES) {
      const surgeRow = rows.at(-10);
      const found = detectAnomalies(rows).find((a) => a.actual === surgeRow.units);
      assert.ok(found, `${label}: injected surge of ${surgeRow.units} units was not detected`);
      assert.equal(found.direction, 'surge', `${label}: surge classified as ${found.direction}`);
    }
  });

  test('finds the injected disruption day', () => {
    // units * 0.58 on the day 23 days before the last day.
    const rows = series('MAA', 'inbound');
    const dipRow = rows.at(-24);
    const found = detectAnomalies(rows).find((a) => a.actual === dipRow.units);
    assert.ok(found, 'injected disruption was not detected');
    assert.equal(found.direction, 'shortfall');
  });

  test('reports each anomaly against its real calendar date', () => {
    // BUG (see report): same UTC-vs-local date bug as buildForecast. The surge that
    // generate.js injects on a Monday is reported to the operator as the Sunday before.
    for (const { label, rows } of ALL_SERIES) {
      const surgeRow = rows.at(-10);
      const found = detectAnomalies(rows).find((a) => a.actual === surgeRow.units);
      assert.equal(
        found.date,
        localIso(new Date(surgeRow.date)),
        `${label}: anomaly reported as ${found.date} but the data day is ${localIso(new Date(surgeRow.date))}`
      );
    }
  });

  test('every anomaly field is finite and internally consistent', () => {
    for (const { label, rows } of ALL_SERIES) {
      for (const a of detectAnomalies(rows)) {
        assert.ok(Number.isFinite(a.actual) && Number.isFinite(a.expected) && Number.isFinite(a.deviationPct), `${label}: non-finite anomaly`);
        assert.ok(['surge', 'shortfall'].includes(a.direction));
        assert.equal(a.direction === 'surge', a.actual > a.expected, `${label} ${a.date}: direction contradicts the numbers`);
        assert.match(a.date, /^\d{4}-\d{2}-\d{2}$/);
      }
    }
  });

  test('a higher z threshold reports no more anomalies than a lower one', () => {
    const rows = series('BOM', 'outbound');
    assert.ok(detectAnomalies(rows, 30, 3.5).length <= detectAnomalies(rows, 30, 2.5).length);
  });

  test('only inspects the requested lookback window', () => {
    const rows = series('BOM', 'outbound');
    assert.ok(detectAnomalies(rows, 5).length <= detectAnomalies(rows, 30).length);
  });
});
