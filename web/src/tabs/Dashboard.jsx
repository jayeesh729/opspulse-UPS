import { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { api } from '../api.js';

const pct = (x) => `${Math.round((x ?? 0) * 100)}%`;
const band = (v) => (v >= 90 ? 'good' : v >= 80 ? 'warn' : 'bad');

export default function Dashboard({ data, site, scenario }) {
  const { kpis, alerts, summary, optimisation } = data;
  const [narrative, setNarrative] = useState(null);
  const [busy, setBusy] = useState(false);

  async function explain() {
    setBusy(true);
    try {
      setNarrative(await api.explain(site, scenario));
    } catch (e) {
      setNarrative({ narrative: `Could not generate briefing: ${e.message}`, source: 'error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="grid k4" style={{ marginBottom: 16 }}>
        <div className="tile hero">
          <div className="label">Operational Efficiency Index</div>
          <div className="value">{kpis.oei}</div>
          <div className="foot">Volume-weighted across all functions · 0–100</div>
        </div>
        <div className="tile">
          <div className="label">Rostered vs required</div>
          <div className="value sm">{summary.available} / {summary.required}</div>
          <div className="foot">
            {summary.netGap < 0
              ? `Short ${Math.abs(summary.netGap)} against forecast workload`
              : `${summary.netGap} spare against forecast workload`}
          </div>
        </div>
        <div className="tile">
          <div className="label">Reclaimable capacity</div>
          <div className="value sm">{optimisation.hoursReclaimedPerWeek.toLocaleString()} h</div>
          <div className="foot">Person-hours per week, via redistribution only</div>
        </div>
        <div className="tile">
          <div className="label">Open exceptions</div>
          <div className="value sm">{alerts.length}</div>
          <div className="foot">Ranked by operational impact</div>
        </div>
      </div>

      <div className="grid k3" style={{ marginBottom: 16 }}>
        {Object.entries(kpis.byFunction).map(([fn, m]) => (
          <div className="card" key={fn} style={{ marginBottom: 0 }}>
            <h2 style={{ textTransform: 'capitalize', marginBottom: 12 }}>
              {fn} <span className={`pill ${band(m.oei)}`}>OEI {m.oei}</span>
            </h2>
            <table>
              <tbody>
                <tr>
                  <td>Throughput vs standard</td>
                  <td className="num"><b>{pct(m.efficiencyRatio)}</b></td>
                </tr>
                <tr>
                  <td>Utilisation</td>
                  <td className="num"><b>{pct(m.utilisation)}</b></td>
                </tr>
                <tr>
                  <td>On-time throughput</td>
                  <td className="num"><b>{pct(m.onTime)}</b></td>
                </tr>
                <tr>
                  <td>Cycle time</td>
                  <td className="num"><b>{m.cycleTimeMin} min/unit</b></td>
                </tr>
              </tbody>
            </table>
          </div>
        ))}
      </div>

      <div className="card">
        <h2>Efficiency trend</h2>
        <div className="sub">Daily OEI — the productivity visibility the brief says is missing</div>
        <ResponsiveContainer width="100%" height={230}>
          <LineChart data={kpis.trend} margin={{ top: 5, right: 10, left: -18, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(d) => d.slice(5)} minTickGap={28} />
            <YAxis domain={[60, 100]} tick={{ fontSize: 11 }} />
            <Tooltip />
            <Line type="monotone" dataKey="oei" stroke="#351c15" strokeWidth={2} dot={false} name="OEI" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="grid k2">
        <div className="card" style={{ marginBottom: 0 }}>
          <h2>Exceptions</h2>
          <div className="sub">Proactive flags, so planning stops being reactive</div>
          {alerts.length === 0 && <div className="state">No exceptions at this scenario.</div>}
          {alerts.map((a, i) => (
            <div className={`alert ${a.severity}`} key={i}>
              <div>
                <div className="t">{a.title}</div>
                <div className="d">{a.detail}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="card" style={{ marginBottom: 0 }}>
          <h2>Shift briefing</h2>
          <div className="sub">The numbers above, written as a manager would brief them</div>
          <button className="btn" onClick={explain} disabled={busy}>
            {busy ? 'Generating…' : 'Generate briefing'}
          </button>
          {narrative && (
            <div className="narrative" style={{ marginTop: 12 }}>
              {narrative.narrative}
              <div className="privacy" style={{ marginTop: 10 }}>
                Source: {narrative.source}
                {narrative.cached ? ' (cached)' : ''}
                {narrative.note ? ` — ${narrative.note}` : ''}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
