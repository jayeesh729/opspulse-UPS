import { useState } from 'react';
import { api, session } from './api.js';

const DEMO_ACCOUNTS = [
  { username: 'maya', role: 'Ops Manager', scope: 'Chennai hub only' },
  { username: 'priya', role: 'Workforce Planner', scope: 'All hubs, can edit' },
  { username: 'leo', role: 'Operations Leader', scope: 'All hubs, read-only' },
  { username: 'admin', role: 'Admin', scope: 'All hubs, full access' },
];

export default function Login({ onSuccess }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError(null);

    // Client-side check for immediate feedback. The server validates independently -
    // this is a convenience, never the control.
    if (username.trim().length < 3) return setError('Username must be at least 3 characters.');
    if (password.length < 6) return setError('Password must be at least 6 characters.');

    setBusy(true);
    try {
      const { token, user } = await api.login(username.trim(), password);
      session.save(token);
      onSuccess(user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function fill(name) {
    setUsername(name);
    setPassword('opspulse2026');
    setError(null);
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-brand">Ops<span>Pulse</span></div>
        <div className="login-tag">Logistics Operations Excellence</div>

        <form onSubmit={submit}>
          <label htmlFor="u">Username</label>
          <input
            id="u" value={username} autoComplete="username" autoFocus
            onChange={(e) => setUsername(e.target.value)} placeholder="e.g. maya"
          />

          <label htmlFor="p">Password</label>
          <input
            id="p" type="password" value={password} autoComplete="current-password"
            onChange={(e) => setPassword(e.target.value)} placeholder="••••••••"
          />

          {error && <div className="login-error">{error}</div>}

          <button className="btn" type="submit" disabled={busy} style={{ width: '100%', marginTop: 14 }}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="login-demo">
          <div className="login-demo-title">Demo accounts — password <code>opspulse2026</code></div>
          {DEMO_ACCOUNTS.map((a) => (
            <button key={a.username} type="button" className="login-demo-row" onClick={() => fill(a.username)}>
              <b>{a.username}</b>
              <span>{a.role}</span>
              <em>{a.scope}</em>
            </button>
          ))}
          <p className="login-note">
            Sign in as <b>maya</b> and then as <b>leo</b> to see the access boundary: a hub manager
            can only reach their own site, and the API refuses the rest regardless of what the
            browser asks for.
          </p>
        </div>
      </div>
    </div>
  );
}
