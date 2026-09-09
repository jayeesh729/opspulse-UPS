import { useEffect, useState, useCallback } from 'react';
import { api, session } from './api.js';
import Login from './Login.jsx';
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
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);
  const [meta, setMeta] = useState(null);
  const [site, setSite] = useState(null);
  const [scenario, setScenario] = useState(1);
  const [tab, setTab] = useState('dashboard');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  // Restore an existing session on reload rather than forcing a second sign-in.
  useEffect(() => {
    if (!session.token) return setBooting(false);
    api.me()
      .then((r) => setUser(r.user))
      .catch(() => session.clear())
      .finally(() => setBooting(false));
  }, []);

  // The API client raises this when a token is rejected, so an expired session
  // returns to the login screen instead of showing broken panels.
  useEffect(() => {
    const signOut = () => { setUser(null); setData(null); setMeta(null); setSite(null); };
    window.addEventListener('opspulse:signed-out', signOut);
    return () => window.removeEventListener('opspulse:signed-out', signOut);
  }, []);

  useEffect(() => {
    if (!user) return;
    api.meta().then(setMeta).catch((e) => setError(e.message));
    setSite(user.sites?.[0]?.code ?? null);
  }, [user]);

  const load = useCallback(async () => {
    if (!site) return;
    setLoading(true);
    try {
      setData(await api.overview(site, scenario));
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [site, scenario]);

  useEffect(() => { load(); }, [load]);

  function signOut() {
    session.clear();
    setUser(null);
    setData(null);
    setMeta(null);
    setSite(null);
  }

  if (booting) return <div className="state">Restoring session…</div>;
  if (!user) return <Login onSuccess={setUser} />;

  const sites = user.sites ?? [];
  const scenarios = meta?.scenarios ?? [];
  const roleLabel = meta?.currentRole?.label ?? user.role;

  return (
    <>
      <header className="topbar">
        <div>
          <div className="brand">Ops<span>Pulse</span></div>
          <div className="tagline">Logistics Operations Excellence</div>
        </div>
        <div className="spacer" />

        <div>
          <label htmlFor="site">Site</label>
          <select id="site" value={site ?? ''} onChange={(e) => setSite(e.target.value)}>
            {sites.map((s) => <option key={s.code} value={s.code}>{s.code} — {s.name}</option>)}
          </select>
          {sites.length === 1 && <div className="scope-note">Scoped to your hub</div>}
        </div>

        <div className="whoami">
          <div className="who-name">{user.name}</div>
          <div className="who-role">{roleLabel}</div>
        </div>
        <button className="btn ghost signout" onClick={signOut}>Sign out</button>
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
            {tab === 'dashboard' && <Dashboard data={data} site={site} scenario={scenario} />}
            {tab === 'forecast' && <Forecast site={site} functions={meta?.functions ?? []} />}
            {tab === 'workforce' && <WorkforcePlan data={data} />}
            {tab === 'optimize' && <Optimization data={data} />}
          </>
        )}
      </main>

      <footer className="site-footer">
        <div className="footer-inner">
          <div className="footer-col">
            <h3>Data &amp; privacy</h3>
            <p>
              {meta?.privacyNote ??
                'All metrics are aggregated at site, function and shift level. No individual employee data is collected or stored.'}
            </p>
            <p>
              OpsPulse measures <strong>processes and operational areas</strong>, never people. It is
              not intended to measure or evaluate individual employee productivity, and the data model
              contains no employee entity by design.
            </p>
          </div>

          <div className="footer-col">
            <h3>Access &amp; scope</h3>
            <p>
              Access is controlled by role and enforced on the server. Your account is signed in as{' '}
              <strong>{roleLabel}</strong> with access to{' '}
              <strong>{sites.length === 1 ? sites[0].name : `all ${sites.length} hubs`}</strong>.
            </p>
            <p>
              Demonstration build on a synthetic dataset. Forecasts are statistical estimates with a
              stated confidence interval; recommendations are advisory and rostering decisions remain
              with the operations manager.
            </p>
          </div>
        </div>

        <div className="footer-bar">
          <span>OpsPulse · Logistics Operations Excellence</span>
          <span>Aggregate-only by design</span>
        </div>
      </footer>
    </>
  );
}
