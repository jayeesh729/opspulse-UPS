import { useEffect, useState, useCallback } from 'react';
import { api } from './api.js';
import Dashboard from './tabs/Dashboard.jsx';
import Forecast from './tabs/Forecast.jsx';
import WorkforcePlan from './tabs/WorkforcePlan.jsx';
import Optimization from './tabs/Optimization.jsx';

const TABS = [
  { key: 'dashboard', label: 'Operations Dashboard' },
  { key: 'forecast', label: 'Volume Forecasting' },
  { key: 'workforce', label: 'Workforce Planning' },
  { key: 'optimize', label: 'Resource Optimisation' },
];

export default function App() {
  const [meta, setMeta] = useState(null);
  const [role, setRole] = useState('manager');
  const [site, setSite] = useState('MAA');
  const [scenario, setScenario] = useState(1);
  const [tab, setTab] = useState('dashboard');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.meta(role).then(setMeta).catch((e) => setError(e.message));
  }, [role]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api.overview(site, scenario, role));
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [site, scenario, role]);

  useEffect(() => { load(); }, [load]);

  const sites = meta?.sites ?? [];
  const scenarios = meta?.scenarios ?? [];

  return (
    <>
      <header className="topbar">
        <div>
          <div className="brand">Ops<span>Pulse</span></div>
          <div className="tagline">Logistics Operations Excellence · UPS 2026 GH-GHS-01</div>
        </div>
        <div className="spacer" />
        <div>
          <label htmlFor="site">Site</label>
          <select id="site" value={site} onChange={(e) => setSite(e.target.value)}>
            {sites.map((s) => <option key={s.code} value={s.code}>{s.code} — {s.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="role">View as</label>
          <select id="role" value={role} onChange={(e) => setRole(e.target.value)}>
            {(meta?.roles ?? []).map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
        </div>
      </header>

      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.key} className={tab === t.key ? 'active' : ''} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </nav>

      <main className="page">
        <div className="card">
          <h2>Scenario planning</h2>
          <div className="sub">Model peak and non-peak demand. Every figure below recomputes live.</div>
          <div className="scenario">
            <div className="chips">
              {scenarios.map((s) => (
                <button
                  key={s.key}
                  className={`chip ${Math.abs(scenario - s.multiplier) < 0.01 ? 'on' : ''}`}
                  onClick={() => setScenario(s.multiplier)}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <input
              type="range" min="0.5" max="2.5" step="0.05"
              value={scenario}
              onChange={(e) => setScenario(Number(e.target.value))}
              aria-label="Volume multiplier"
            />
            <div className="mult">{scenario.toFixed(2)}×</div>
          </div>
        </div>

        {error && <div className="state err">Error: {error}</div>}
        {!error && loading && !data && <div className="state">Loading operational data…</div>}

        {data && (
          <>
            {tab === 'dashboard' && <Dashboard data={data} site={site} scenario={scenario} role={role} />}
            {tab === 'forecast' && <Forecast site={site} role={role} functions={meta?.functions ?? []} />}
            {tab === 'workforce' && <WorkforcePlan data={data} />}
            {tab === 'optimize' && <Optimization data={data} />}
          </>
        )}

        {meta && <div className="privacy">🔒 {meta.privacyNote}</div>}
      </main>
    </>
  );
}
