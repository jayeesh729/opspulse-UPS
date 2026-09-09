// Volume forecasting by seasonal decomposition + Holt's linear trend.
//
// Why not a trained ML model? 120 days of history does not justify one, and an
// unexplainable model is worse than a slightly less accurate explainable one when an
// operations manager has to defend a staffing decision.
//
// Method: strip weekday seasonality, smooth level and trend exponentially (Holt),
// then put seasonality back. Exponential smoothing is used rather than a straight-line
// fit because volume ramps into peak season - a linear fit lags a ramp badly, which
// is exactly when the forecast matters most.

const iso = (d) => d.toISOString().slice(0, 10);
const dow = (d) => new Date(d).getDay();

function weekdayIndex(rows) {
  const sums = Array(7).fill(0);
  const counts = Array(7).fill(0);
  for (const r of rows) {
    const d = dow(r.date);
    sums[d] += r.units;
    counts[d] += 1;
  }
  const overall = rows.reduce((a, r) => a + r.units, 0) / Math.max(1, rows.length);
  if (overall <= 0) return Array(7).fill(1);
  return sums.map((s, i) => (counts[i] ? s / counts[i] / overall : 1));
}

/** Holt's linear trend: level and slope both smoothed, so the model tracks a ramp. */
function holt(ys, alpha = 0.35, beta = 0.12) {
  if (!ys.length) return { level: 0, trend: 0, fitted: [] };
  let level = ys[0];
  let trend = ys.length > 1 ? ys[1] - ys[0] : 0;
  const fitted = [];

  for (let i = 0; i < ys.length; i++) {
    fitted.push(i === 0 ? ys[0] : level + trend); // one-step-ahead prediction
    const prevLevel = level;
    level = alpha * ys[i] + (1 - alpha) * (level + trend);
    trend = beta * (level - prevLevel) + (1 - beta) * trend;
  }
  return { level, trend, fitted };
}

/**
 * Fit on a trailing window.
 * Returns a forward projector, the in-sample fitted values, and the residual spread.
 */
export function fitModel(rows, windowDays = 60) {
  const idx = weekdayIndex(rows); // seasonality from the full history - more stable
  const win = rows.slice(-windowDays);
  const deseasonalised = win.map((r) => r.units / (idx[dow(r.date)] || 1));
  const { level, trend, fitted } = holt(deseasonalised);

  // Re-seasonalised in-sample fit, used for residuals and anomaly detection.
  const fittedSeasonal = win.map((r, i) => Math.max(0, fitted[i] * (idx[dow(r.date)] || 1)));

  let se = 0;
  win.forEach((r, i) => { se += (r.units - fittedSeasonal[i]) ** 2; });
  const sigma = Math.sqrt(se / Math.max(1, win.length - 2));

  return {
    idx,
    level,
    trend,
    sigma,
    n: win.length,
    window: win,
    fittedSeasonal,
    /** k steps beyond the end of the fitting window. */
    project: (k, weekday) => Math.max(0, (level + k * trend) * (idx[weekday] || 1)),
  };
}

/** Forward projection with a widening 95% confidence band. */
export function buildForecast(rows, horizon = 14) {
  if (!rows.length) return [];
  const m = fitModel(rows);
  const last = new Date(rows[rows.length - 1].date);

  const out = [];
  for (let k = 1; k <= horizon; k++) {
    const d = new Date(last);
    d.setDate(d.getDate() + k);
    const point = m.project(k, d.getDay());
    // Uncertainty grows the further out we look - saying so is more honest than one line.
    const band = 1.96 * m.sigma * Math.sqrt(1 + k / 14);
    out.push({
      date: iso(d),
      units: Math.round(point),
      lower: Math.round(Math.max(0, point - band)),
      upper: Math.round(point + band),
    });
  }
  return out;
}

/**
 * Fixed-origin backtest: hide the last `holdout` days, forecast them, measure the error.
 * Reported against two baselines, because a forecast that cannot beat "assume next week
 * looks like last week" is not worth deploying.
 */
export function backtest(rows, holdout = 14) {
  if (rows.length < holdout + 60) return null;

  const train = rows.slice(0, -holdout);
  const test = rows.slice(-holdout);
  const m = fitModel(train);
  const lastValue = train[train.length - 1].units;

  let ours = 0, naive = 0, seasonalNaive = 0;
  test.forEach((r, k) => {
    const actual = r.units || 1;
    ours += Math.abs(actual - m.project(k + 1, dow(r.date))) / actual;
    naive += Math.abs(actual - lastValue) / actual;
    const sn = train[train.length - 7 + (k % 7)]?.units ?? lastValue;
    seasonalNaive += Math.abs(actual - sn) / actual;
  });

  const n = test.length;
  const pct = (x) => Math.round((100 * x) / n * 10) / 10;
  const mape = pct(ours);
  const naiveMape = pct(naive);
  const seasonalNaiveMape = pct(seasonalNaive);
  const best = Math.min(naiveMape, seasonalNaiveMape);

  return {
    mape,
    naiveMape,
    seasonalNaiveMape,
    holdoutDays: holdout,
    // Error reduction against the stronger of the two baselines - the honest comparison.
    improvementPct: best > 0 ? Math.round(((best - mape) / best) * 1000) / 10 : 0,
  };
}

/** Days that sit far outside the model's expected range - the anomaly detector. */
export function detectAnomalies(rows, lookback = 30, z = 2.5) {
  if (rows.length < 60) return [];
  const m = fitModel(rows);
  const from = Math.max(0, m.n - lookback);
  const out = [];

  for (let i = from; i < m.n; i++) {
    const r = m.window[i];
    const expected = m.fittedSeasonal[i];
    const dev = m.sigma > 0 ? (r.units - expected) / m.sigma : 0;
    if (Math.abs(dev) >= z) {
      out.push({
        date: iso(new Date(r.date)),
        actual: r.units,
        expected: Math.round(expected),
        deviationPct: Math.round(((r.units - expected) / Math.max(1, expected)) * 100),
        direction: dev > 0 ? 'surge' : 'shortfall',
      });
    }
  }
  return out;
}
