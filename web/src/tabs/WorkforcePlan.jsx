import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const pct = (x) => `${Math.round((x ?? 0) * 100)}%`;

function gapPill(gap) {
  if (gap < 0) return <span className="pill bad">short {Math.abs(gap)}</span>;
  if (gap > 0) return <span className="pill good">+{gap} spare</span>;
  return <span className="pill warn">exact</span>;
}

function utilPill(u) {
  if (!u) return null;
  if (u > 0.95) return <span className="pill bad">{pct(u)}</span>;
  if (u < 0.7) return <span className="pill warn">{pct(u)}</span>;
  return <span className="pill good">{pct(u)}</span>;
}

export default function WorkforcePlan({ data }) {
  const { plan, summary } = data;

  const chart = plan.map((r) => ({
    area: `${r.functionType.slice(0, 3)}/${r.shift.slice(0, 3)}`,
    Required: r.required,
    Available: r.available,
  }));

  return (
    <>
      <div className="grid k4" style={{ marginBottom: 16 }}>
        <div className="tile">
          <div className="label">Required headcount</div>
          <div className="value sm">{summary.required}</div>
          <div className="foot">Derived from the forecast workload</div>
        </div>
        <div className="tile">
          <div className="label">Rostered headcount</div>
          <div className="value sm">{summary.available}</div>
          <div className="foot">Currently available across all shifts</div>
        </div>
        <div className="tile">
          <div className="label">Net position</div>
          <div className="value sm" style={{ color: summary.netGap < 0 ? 'var(--bad)' : 'var(--good)' }}>
            {summary.netGap > 0 ? '+' : ''}{summary.netGap}
          </div>
          <div className="foot">
            {Math.abs(summary.netGap) <= 5
              ? 'Broadly balanced overall — the problem is distribution'
              : summary.netGap < 0 ? 'Genuine capacity shortfall' : 'Genuine surplus'}
          </div>
        </div>
        <div className="tile">
          <div className="label">Misallocation</div>
          <div className="value sm">{summary.shortPositions} / {summary.surplusPositions}</div>
          <div className="foot">Positions short vs spare, across areas</div>
        </div>
      </div>

      <div className="card">
        <h2>Manpower requirement by function and shift</h2>
        <div className="sub">
          Forecast units → productive hours (÷ engineered standard) → paid hours (÷ target
          utilisation) → headcount (÷ shift length, uplifted for absenteeism)
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Function</th>
                <th>Shift</th>
                <th className="num">Forecast units</th>
                <th className="num">Productive hrs</th>
                <th className="num">Paid hrs</th>
                <th className="num">Required</th>
                <th className="num">Available</th>
                <th>Gap</th>
                <th>Projected utilisation</th>
              </tr>
            </thead>
            <tbody>
              {plan.map((r) => (
                <tr key={`${r.functionType}-${r.shift}`}>
                  <td style={{ textTransform: 'capitalize' }}>{r.functionType}</td>
                  <td>{r.shift}</td>
                  <td className="num">{r.forecastUnits.toLocaleString()}</td>
                  <td className="num">{r.productiveHours}</td>
                  <td className="num">{r.paidHours}</td>
                  <td className="num"><b>{r.required}</b></td>
                  <td className="num">{r.available}</td>
                  <td>{gapPill(r.gap)}</td>
                  <td>{utilPill(r.utilisationIfUnchanged)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h2>Required against rostered</h2>
        <div className="sub">Where the roster and the forecast workload disagree</div>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chart} margin={{ top: 5, right: 10, left: -18, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
            <XAxis dataKey="area" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Legend />
            <Bar dataKey="Required" fill="#351c15" radius={[3, 3, 0, 0]} />
            <Bar dataKey="Available" fill="#ffb500" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}
