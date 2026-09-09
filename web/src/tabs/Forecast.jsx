import { useEffect, useState } from 'react';
import {
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { api } from '../api.js';

export default function Forecast({ site, role, functions }) {
  const [fn, setFn] = useState('outbound');
  const [horizon, setHorizon] = useState(14);
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let live = true;
    api.forecast(site, fn, horizon, role)
      .then((r) => live && (setD(r), setErr(null)))
      .catch((e) => live && setErr(e.message));
    return () => { live = false; };
  }, [site, fn, horizon, role]);

  if (err) return <div className="state err">Error: {err}</div>;
  if (!d) return <div className="state">Loading forecast…</div>;

  // History and projection on one axis.
  // Every row carries the same keys and the band is always a two-element array -
  // Recharts silently drops the whole plot layer if a range Area sees undefined.
  // Over history the band is zero-width, so it is invisible.
  const chart = [
    ...d.history.map((h) => ({ date: h.date, actual: h.units, forecast: null, band: [h.units, h.units] })),
    ...d.forecast.map((f) => ({ date: f.date, actual: null, forecast: f.units, band: [f.lower, f.upper] })),
  ];
  // Bridge the join so the dashed forecast line continues from the last actual
  // instead of starting in mid-air.
  if (d.history.length) chart[d.history.length - 1].forecast = d.history[d.history.length - 1].units;

  const a = d.accuracy;
  const bestBaseline = a ? Math.min(a.naiveMape, a.seasonalNaiveMape) : null;

  return (
    <>
      <div className="card">
        <div style={{ display: 'flex', gap: 18, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 14 }}>
          <div>
            <div className="label" style={{ fontSize: 11, color: 'var(--muted)' }}>FUNCTION</div>
            <select value={fn} onChange={(e) => setFn(e.target.value)} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--line)' }}>
              {functions.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div>
            <div className="label" style={{ fontSize: 11, color: 'var(--muted)' }}>HORIZON</div>
            <select value={horizon} onChange={(e) => setHorizon(Number(e.target.value))} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--line)' }}>
              {[7, 14, 21, 30].map((h) => <option key={h} value={h}>{h} days</option>)}
            </select>
          </div>
        </div>

        <h2 style={{ textTransform: 'capitalize' }}>{fn} volume — {site}</h2>
        <div className="sub">
          Seasonal decomposition with Holt&rsquo;s linear trend. Shaded area is the 95% confidence
          interval, widening with horizon.
        </div>

        <ResponsiveContainer width="100%" height={320}>
          <ComposedChart data={chart} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(x) => x.slice(5)} minTickGap={30} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
            <Tooltip formatter={(v) => (Array.isArray(v) ? `${v[0].toLocaleString()} – ${v[1].toLocaleString()}` : v.toLocaleString())} />
            <Legend />
            <Area dataKey="band" stroke="none" fill="#ffb500" fillOpacity={0.22} name="95% confidence" />
            <Line type="monotone" dataKey="actual" stroke="#351c15" strokeWidth={2} dot={false} name="Actual" />
            <Line type="monotone" dataKey="forecast" stroke="#b45309" strokeWidth={2.5} strokeDasharray="5 4" dot={false} name="Forecast" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="grid k2">
        <div className="card" style={{ marginBottom: 0 }}>
          <h2>Forecast accuracy</h2>
          <div className="sub">
            Backtested on the last {a?.holdoutDays ?? 14} days, hidden from the model. A forecast that
            cannot beat its baselines is not worth deploying.
          </div>
          {!a && <div className="state">Not enough history to backtest.</div>}
          {a && (
            <>
              <div className="grid k3" style={{ marginBottom: 12 }}>
                <div className="tile">
                  <div className="label">Our model (MAPE)</div>
                  <div className="value sm" style={{ color: 'var(--good)' }}>{a.mape}%</div>
                </div>
                <div className="tile">
                  <div className="label">Naive baseline</div>
                  <div className="value sm">{a.naiveMape}%</div>
                </div>
                <div className="tile">
                  <div className="label">Seasonal naive</div>
                  <div className="value sm">{a.seasonalNaiveMape}%</div>
                </div>
              </div>
              <div className="narrative">
                <b>{a.improvementPct}% lower error</b> than the stronger baseline
                ({bestBaseline}% → {a.mape}%). Mean absolute percentage error, so a
                10% figure means a 10,000-parcel day is typically predicted within 1,000.
              </div>
            </>
          )}
        </div>

        <div className="card" style={{ marginBottom: 0 }}>
          <h2>Detected anomalies</h2>
          <div className="sub">Days more than 2.5 standard deviations from the model&rsquo;s expectation</div>
          {d.anomalies.length === 0 && <div className="state">No anomalies in the last 30 days.</div>}
          {d.anomalies.map((an) => (
            <div className={`alert ${an.direction === 'surge' ? 'high' : 'medium'}`} key={an.date}>
              <div>
                <div className="t">
                  {an.date} — {an.direction === 'surge' ? 'Volume surge' : 'Volume shortfall'} {an.deviationPct > 0 ? '+' : ''}{an.deviationPct}%
                </div>
                <div className="d">
                  Actual {an.actual.toLocaleString()} against an expected {an.expected.toLocaleString()}.
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
