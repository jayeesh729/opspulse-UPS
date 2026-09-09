import { OEI_WEIGHTS, SHIFTS } from '../config.js';
import { isoDate } from '../util/date.js';

// The Operational Efficiency Index.
//
// The brief's first challenge is "lack of a measurable yardstick to evaluate
// operational efficiency". This is that yardstick. It is deliberately a weighted
// composite of three things an operations leader already understands, and we always
// expose the three components so it can be argued with rather than trusted blindly.

const SHIFT_HOURS = SHIFTS[0].hours;

export function metricsFor(rows, standard) {
  if (!rows.length) {
    return { units: 0, labourHours: 0, throughput: 0, efficiencyRatio: 0, utilisation: 0, onTime: 0, cycleTimeMin: 0, oei: 0, headcount: 0 };
  }

  const units = rows.reduce((a, r) => a + r.units, 0);
  const labourHours = rows.reduce((a, r) => a + r.labourHours, 0);
  const headcount = rows.reduce((a, r) => a + r.headcount, 0);
  const onTime = rows.reduce((a, r) => a + r.onTimePct, 0) / rows.length;

  // Actual units per productive person-hour.
  const throughput = labourHours > 0 ? units / labourHours : 0;
  // Against the engineered standard: 1.0 means the area is hitting benchmark.
  const efficiencyRatio = standard ? throughput / standard.unitsPerPersonHour : 0;
  // Productive hours as a share of paid hours.
  const utilisation = headcount > 0 ? labourHours / (headcount * SHIFT_HOURS) : 0;
  const cycleTimeMin = throughput > 0 ? 60 / throughput : 0;

  const oei =
    100 *
    (OEI_WEIGHTS.efficiency * Math.min(efficiencyRatio, 1) +
      OEI_WEIGHTS.utilisation * Math.min(utilisation, 1) +
      OEI_WEIGHTS.onTime * Math.min(onTime, 1));

  const r1 = (x) => Math.round(x * 10) / 10;
  return {
    units,
    labourHours: r1(labourHours),
    headcount,
    throughput: r1(throughput),
    efficiencyRatio: Math.round(efficiencyRatio * 1000) / 1000,
    utilisation: Math.round(utilisation * 1000) / 1000,
    onTime: Math.round(onTime * 1000) / 1000,
    cycleTimeMin: Math.round(cycleTimeMin * 100) / 100,
    oei: Math.round(oei),
  };
}

/** KPIs per function plus a site-level roll-up, and a daily OEI trend for charting. */
export function computeKpis(rows, standardsByFunction) {
  const byFunction = {};
  for (const [fn, std] of Object.entries(standardsByFunction)) {
    byFunction[fn] = metricsFor(rows.filter((r) => r.functionType === fn), std);
  }

  // Site roll-up: weight each function's OEI by its share of total volume, so a
  // large struggling area is not hidden by a small excellent one.
  const totalUnits = Object.values(byFunction).reduce((a, m) => a + m.units, 0);
  const oei = totalUnits
    ? Math.round(Object.values(byFunction).reduce((a, m) => a + m.oei * (m.units / totalUnits), 0))
    : 0;

  const byDate = new Map();
  for (const r of rows) {
    const key = isoDate(r.date);
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key).push(r);
  }
  const trend = [...byDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, dayRows]) => {
      const dayUnits = dayRows.reduce((a, r) => a + r.units, 0);
      const scored = dayRows.map((r) => ({
        oei: metricsFor([r], standardsByFunction[r.functionType]).oei,
        w: r.units / Math.max(1, dayUnits),
      }));
      return { date, oei: Math.round(scored.reduce((a, s) => a + s.oei * s.w, 0)), units: dayUnits };
    });

  return { oei, totalUnits, byFunction, trend };
}

/** Turns KPI output into the proactive exception feed the brief asks for. */
export function buildAlerts(kpis, plan) {
  const alerts = [];

  for (const [fn, m] of Object.entries(kpis.byFunction)) {
    if (m.efficiencyRatio > 0 && m.efficiencyRatio < 0.85) {
      alerts.push({
        severity: 'high',
        area: fn,
        title: `${fn} running below benchmark`,
        detail: `Throughput is ${Math.round(m.efficiencyRatio * 100)}% of the engineered standard (${m.throughput} vs benchmark).`,
      });
    }
    if (m.utilisation > 0 && m.utilisation < 0.7) {
      alerts.push({
        severity: 'medium',
        area: fn,
        title: `${fn} under-utilised`,
        detail: `Only ${Math.round(m.utilisation * 100)}% of paid hours are productive - capacity available for redistribution.`,
      });
    }
    if (m.utilisation > 0.95) {
      alerts.push({
        severity: 'high',
        area: fn,
        title: `${fn} over-utilised`,
        detail: `${Math.round(m.utilisation * 100)}% utilisation leaves no buffer for volume spikes.`,
      });
    }
  }

  for (const row of plan || []) {
    if (row.gap < 0) {
      alerts.push({
        severity: Math.abs(row.gap) >= 4 ? 'high' : 'medium',
        area: `${row.functionType} / ${row.shift}`,
        title: `Understaffed: ${row.functionType} ${row.shift}`,
        detail: `Forecast workload needs ${row.required} people, ${row.available} available - short by ${Math.abs(row.gap)}.`,
      });
    }
  }

  const rank = { high: 0, medium: 1, low: 2 };
  return alerts.sort((a, b) => rank[a.severity] - rank[b.severity]).slice(0, 8);
}
