import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import { metricsFor, computeKpis, buildAlerts } from '../src/engine/kpis.js';
import { generateOperations } from '../src/data/generate.js';
import { STANDARDS, SITES, FUNCTIONS, SHIFTS, OEI_WEIGHTS } from '../src/config.js';

const SHIFT_HOURS = SHIFTS[0].hours;
const OPS = generateOperations();

/** Asserts no NaN / Infinity / undefined has leaked into anything the UI will render. */
function assertAllNumbersFinite(obj, label) {
  for (const [key, value] of Object.entries(obj)) {
    assert.ok(value !== undefined, `${label}: field "${key}" is undefined`);
    if (typeof value === 'number') {
      assert.ok(Number.isFinite(value), `${label}: field "${key}" is ${value}`);
    }
  }
}

const row = (over = {}) => ({ units: 450, labourHours: 10, headcount: 2, onTimePct: 0.95, functionType: 'inbound', ...over });

// Degenerate but schema-legal inputs (models/index.js enforces units/labourHours/
// headcount >= 0 and onTimePct in 0..1).
const DEGENERATE = [
  ['zero labour hours', [row({ labourHours: 0 })]],
  ['zero headcount', [row({ headcount: 0 })]],
  ['zero labour hours and zero headcount', [row({ labourHours: 0, headcount: 0 })]],
  ['zero units', [row({ units: 0 })]],
  ['everything zero', [row({ units: 0, labourHours: 0, headcount: 0, onTimePct: 0 })]],
  ['perfect on-time', [row({ onTimePct: 1 })]],
  ['zero on-time', [row({ onTimePct: 0 })]],
  ['throughput far above standard', [row({ units: 100000, labourHours: 1 })]],
  ['utilisation far above 1', [row({ labourHours: 900, headcount: 1 })]],
  ['single unit', [row({ units: 1, labourHours: 0.1, headcount: 1 })]],
  ['many mixed days', [row(), row({ units: 0, labourHours: 0, headcount: 0, onTimePct: 0 }), row({ labourHours: 0 })]],
];

describe('metricsFor', () => {
  test('an empty array returns zeros, never NaN', () => {
    const m = metricsFor([], STANDARDS.inbound);
    assertAllNumbersFinite(m, 'metricsFor([])');
    for (const [key, value] of Object.entries(m)) {
      assert.equal(value, 0, `metricsFor([]).${key} should be 0, got ${value}`);
    }
  });

  test('an empty array returns the SAME fields as a populated call', () => {
    // BUG (see report): the empty-input early return omits `labourHours`, so a site
    // or function with no rows in the selected window renders `undefined` in the UI.
    const populated = metricsFor([row()], STANDARDS.inbound);
    const empty = metricsFor([], STANDARDS.inbound);
    const missing = Object.keys(populated).filter((k) => !(k in empty));
    assert.deepEqual(missing, [], `metricsFor([]) is missing field(s): ${missing.join(', ')}`);
  });

  test('an empty array with no standard still returns zeros', () => {
    const m = metricsFor([], undefined);
    assertAllNumbersFinite(m, 'metricsFor([], undefined)');
    assert.equal(m.oei, 0);
  });

  test('throughput exactly at the engineered standard gives efficiencyRatio === 1', () => {
    for (const [fn, std] of Object.entries(STANDARDS)) {
      // one person-hour producing exactly the standard number of units
      const m = metricsFor([row({ units: std.unitsPerPersonHour, labourHours: 1, headcount: 1 })], std);
      assert.equal(m.efficiencyRatio, 1, `${fn}: efficiencyRatio was ${m.efficiencyRatio}`);
      assert.equal(m.throughput, std.unitsPerPersonHour);
    }
  });

  test('efficiencyRatio scales linearly with throughput', () => {
    const std = STANDARDS.inbound;
    const half = metricsFor([row({ units: std.unitsPerPersonHour / 2, labourHours: 1 })], std);
    const double = metricsFor([row({ units: std.unitsPerPersonHour * 2, labourHours: 1 })], std);
    assert.equal(half.efficiencyRatio, 0.5);
    assert.equal(double.efficiencyRatio, 2);
  });

  test('utilisation is productive hours over paid hours', () => {
    const m = metricsFor([row({ labourHours: SHIFT_HOURS * 2 * 0.75, headcount: 2 })], STANDARDS.inbound);
    assert.equal(m.utilisation, 0.75);
  });

  test('cycleTimeMin is the inverse of throughput in minutes', () => {
    const m = metricsFor([row({ units: 60, labourHours: 1 })], STANDARDS.inbound);
    assert.equal(m.throughput, 60);
    assert.equal(m.cycleTimeMin, 1);
  });

  test('oei stays within 0..100 for degenerate inputs', () => {
    for (const [label, rows] of DEGENERATE) {
      const m = metricsFor(rows, STANDARDS.inbound);
      assert.ok(Number.isFinite(m.oei), `${label}: oei is ${m.oei}`);
      assert.ok(m.oei >= 0 && m.oei <= 100, `${label}: oei ${m.oei} outside 0..100`);
    }
  });

  test('oei stays within 0..100 when there is no standard at all', () => {
    for (const [label, rows] of DEGENERATE) {
      const m = metricsFor(rows, undefined);
      assert.ok(Number.isFinite(m.oei), `${label} (no standard): oei is ${m.oei}`);
      assert.ok(m.oei >= 0 && m.oei <= 100, `${label} (no standard): oei ${m.oei} outside 0..100`);
    }
  });

  test('no field is ever NaN or Infinity for degenerate inputs', () => {
    for (const [label, rows] of DEGENERATE) {
      assertAllNumbersFinite(metricsFor(rows, STANDARDS.inbound), label);
      assertAllNumbersFinite(metricsFor(rows, undefined), `${label} (no standard)`);
    }
  });

  test('a perfect area scores exactly 100', () => {
    const std = STANDARDS.inbound;
    // benchmark throughput, every paid hour productive, 100% on time
    const m = metricsFor([row({ units: std.unitsPerPersonHour * SHIFT_HOURS, labourHours: SHIFT_HOURS, headcount: 1, onTimePct: 1 })], std);
    assert.equal(m.efficiencyRatio, 1);
    assert.equal(m.utilisation, 1);
    assert.equal(m.oei, 100);
  });

  test('oei is the documented weighted blend of its three components', () => {
    const std = STANDARDS.inbound;
    const m = metricsFor([row({ units: std.unitsPerPersonHour * 4, labourHours: 4, headcount: 1, onTimePct: 0.9 })], std);
    const expected = Math.round(
      100 * (OEI_WEIGHTS.efficiency * 1 + OEI_WEIGHTS.utilisation * Math.min(m.utilisation, 1) + OEI_WEIGHTS.onTime * 0.9)
    );
    assert.equal(m.oei, expected);
  });

  test('every real site/function slice produces finite metrics inside 0..100', () => {
    for (const site of SITES) {
      for (const fn of FUNCTIONS) {
        const rows = OPS.filter((o) => o.siteCode === site.code && o.functionType === fn);
        const m = metricsFor(rows, STANDARDS[fn]);
        assertAllNumbersFinite(m, `${site.code}/${fn}`);
        assert.ok(m.oei >= 0 && m.oei <= 100, `${site.code}/${fn}: oei ${m.oei}`);
        assert.ok(m.units > 0 && m.throughput > 0);
      }
    }
  });
});

describe('computeKpis', () => {
  const rowsFor = (site) => OPS.filter((o) => o.siteCode === site);

  test('produces one entry per configured standard', () => {
    const k = computeKpis(rowsFor('MAA'), STANDARDS);
    assert.deepEqual(Object.keys(k.byFunction).sort(), FUNCTIONS.slice().sort());
  });

  test('site oei is finite and within 0..100 for every site', () => {
    for (const site of SITES) {
      const k = computeKpis(rowsFor(site.code), STANDARDS);
      assert.ok(Number.isFinite(k.oei), `${site.code}: oei is ${k.oei}`);
      assert.ok(k.oei >= 0 && k.oei <= 100, `${site.code}: oei ${k.oei} outside 0..100`);
    }
  });

  test('totalUnits is the sum of the per-function unit totals', () => {
    for (const site of SITES) {
      const k = computeKpis(rowsFor(site.code), STANDARDS);
      const summed = Object.values(k.byFunction).reduce((a, m) => a + m.units, 0);
      assert.equal(k.totalUnits, summed, `${site.code}`);
    }
  });

  test('the daily trend is chronologically sorted with one point per day', () => {
    const k = computeKpis(rowsFor('BOM'), STANDARDS);
    const dates = k.trend.map((t) => t.date);
    assert.deepEqual(dates, [...dates].sort(), 'trend is not sorted by date');
    assert.equal(new Set(dates).size, dates.length, 'trend contains duplicate dates');
    assert.ok(k.trend.length > 0);
  });

  test('every trend point is finite with an oei inside 0..100', () => {
    for (const site of SITES) {
      for (const point of computeKpis(rowsFor(site.code), STANDARDS).trend) {
        assertAllNumbersFinite(point, `${site.code} trend ${point.date}`);
        assert.ok(point.oei >= 0 && point.oei <= 100, `${site.code} ${point.date}: oei ${point.oei}`);
        assert.ok(point.units > 0);
      }
    }
  });

  test('trend units sum back to totalUnits', () => {
    const k = computeKpis(rowsFor('DEL'), STANDARDS);
    assert.equal(k.trend.reduce((a, t) => a + t.units, 0), k.totalUnits);
  });

  test('empty input yields zeros rather than NaN', () => {
    const k = computeKpis([], STANDARDS);
    assert.equal(k.oei, 0);
    assert.equal(k.totalUnits, 0);
    assert.deepEqual(k.trend, []);
    for (const fn of FUNCTIONS) assert.equal(k.byFunction[fn].oei, 0);
  });

  test('a function with no standard is simply absent, not NaN', () => {
    const k = computeKpis(rowsFor('MAA'), { inbound: STANDARDS.inbound });
    assert.deepEqual(Object.keys(k.byFunction), ['inbound']);
    assert.ok(Number.isFinite(k.oei));
  });
});

describe('buildAlerts', () => {
  const kpisWith = (byFunction) => ({ byFunction });

  test('never returns more than eight alerts', () => {
    const many = {};
    for (let i = 0; i < 20; i++) many[`fn${i}`] = { efficiencyRatio: 0.5, utilisation: 0.5, throughput: 10 };
    assert.ok(buildAlerts(kpisWith(many), []).length <= 8);
  });

  test('sorts high severity ahead of medium', () => {
    const alerts = buildAlerts(
      kpisWith({ inbound: { efficiencyRatio: 0.9, utilisation: 0.5, throughput: 10 } }),
      [{ functionType: 'outbound', shift: 'Evening', gap: -6, required: 20, available: 14 }]
    );
    const rank = { high: 0, medium: 1, low: 2 };
    for (let i = 1; i < alerts.length; i++) {
      assert.ok(rank[alerts[i].severity] >= rank[alerts[i - 1].severity], 'alerts are not severity-sorted');
    }
    assert.equal(alerts[0].severity, 'high');
  });

  test('flags below-benchmark efficiency but not a healthy area', () => {
    const bad = buildAlerts(kpisWith({ inbound: { efficiencyRatio: 0.6, utilisation: 0.85, throughput: 27 } }), []);
    assert.equal(bad.length, 1);
    assert.equal(bad[0].severity, 'high');
    assert.equal(bad[0].area, 'inbound');

    const good = buildAlerts(kpisWith({ inbound: { efficiencyRatio: 0.95, utilisation: 0.85, throughput: 43 } }), []);
    assert.deepEqual(good, []);
  });

  test('flags both under- and over-utilisation', () => {
    const under = buildAlerts(kpisWith({ a: { efficiencyRatio: 0.9, utilisation: 0.5, throughput: 1 } }), []);
    assert.equal(under[0].title, 'a under-utilised');
    assert.equal(under[0].severity, 'medium');

    const over = buildAlerts(kpisWith({ a: { efficiencyRatio: 0.9, utilisation: 0.99, throughput: 1 } }), []);
    assert.equal(over[0].title, 'a over-utilised');
    assert.equal(over[0].severity, 'high');
  });

  test('a shortfall of four or more people is high severity, less is medium', () => {
    const kpis = kpisWith({});
    const big = buildAlerts(kpis, [{ functionType: 'outbound', shift: 'Evening', gap: -4, required: 10, available: 6 }]);
    const small = buildAlerts(kpis, [{ functionType: 'outbound', shift: 'Evening', gap: -3, required: 10, available: 7 }]);
    assert.equal(big[0].severity, 'high');
    assert.equal(small[0].severity, 'medium');
    assert.equal(big[0].area, 'outbound / Evening');
  });

  test('a fully staffed plan raises no staffing alert', () => {
    const alerts = buildAlerts(kpisWith({}), [{ functionType: 'inbound', shift: 'Morning', gap: 3, required: 10, available: 13 }]);
    assert.deepEqual(alerts, []);
  });

  test('tolerates a missing plan', () => {
    assert.deepEqual(buildAlerts(kpisWith({}), undefined), []);
    assert.deepEqual(buildAlerts(kpisWith({}), null), []);
  });

  test('every alert carries the fields the UI renders', () => {
    const kpis = computeKpis(OPS.filter((o) => o.siteCode === 'MAA'), STANDARDS);
    const alerts = buildAlerts(kpis, [{ functionType: 'outbound', shift: 'Evening', gap: -5, required: 30, available: 25 }]);
    for (const a of alerts) {
      for (const field of ['severity', 'area', 'title', 'detail']) {
        assert.ok(a[field], `alert missing ${field}: ${JSON.stringify(a)}`);
      }
      assert.ok(['high', 'medium', 'low'].includes(a.severity));
      assert.ok(!a.detail.includes('NaN'), `alert detail contains NaN: ${a.detail}`);
      assert.ok(!a.detail.includes('undefined'), `alert detail contains undefined: ${a.detail}`);
    }
  });
});
