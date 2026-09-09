const pct = (x) => `${Math.round((x ?? 0) * 100)}%`;

function csv(plan, optimisation, site) {
  const lines = [['section', 'shift', 'from', 'to', 'people', 'detail'].join(',')];
  for (const m of optimisation.moves) lines.push(['move', m.shift, m.from, m.to, m.people, `"${m.rationale}"`].join(','));
  for (const c of optimisation.crossTraining) lines.push(['cross-training', c.shift, c.trainFrom, c.toCover, c.people, `"${c.detail}"`].join(','));
  for (const r of optimisation.residualShortfall) lines.push(['unresolved', r.shift, '', r.functionType, r.people, '"needs overtime or hiring"'].join(','));
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `opspulse-plan-${site}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function Optimization({ data }) {
  const { optimisation: o, site } = data;

  return (
    <>
      <div className={`narrative ${o.recommendation.mode === 'capacity-shortfall' ? '' : ''}`} style={{ marginBottom: 16 }}>
        <b>{o.recommendation.headline}</b>
        {o.recommendation.mode === 'capacity-shortfall' && (
          <div style={{ marginTop: 8, fontSize: 13 }}>
            Options: <b>{o.recommendation.overtimeHoursPerWeek.toLocaleString()} overtime hours a week</b>
            {' '}(≈ {o.recommendation.fteEquivalent} FTE) or <b>{o.recommendation.temporaryHires} temporary hires</b>.
            {o.recommendation.priorityAreas.length > 0 && (
              <> Prioritise{' '}
                {o.recommendation.priorityAreas.map((p, i) => (
                  <span key={p.area}>{i > 0 ? ', ' : ''}<b>{p.area}</b> ({p.people})</span>
                ))}.
              </>
            )}
          </div>
        )}
      </div>

      <div className="grid k4" style={{ marginBottom: 16 }}>
        <div className="tile hero">
          <div className="label">
            {o.hoursReclaimedPerWeek > 0 ? 'Reclaimable per week' : 'Capacity needed per week'}
          </div>
          <div className="value">
            {(o.hoursReclaimedPerWeek > 0 ? o.hoursReclaimedPerWeek : o.recommendation.overtimeHoursPerWeek).toLocaleString()}
          </div>
          <div className="foot">
            {o.hoursReclaimedPerWeek > 0
              ? 'Person-hours, by redistribution alone — no hiring'
              : 'Person-hours of overtime or new capacity required'}
          </div>
        </div>
        <div className="tile">
          <div className="label">People redeployed</div>
          <div className="value sm">{o.peopleMoved}</div>
          <div className="foot">Within their existing shift and skillset</div>
        </div>
        <div className="tile">
          <div className="label">Still unresolved</div>
          <div className="value sm" style={{ color: o.residualPeople ? 'var(--bad)' : 'var(--good)' }}>
            {o.residualPeople}
          </div>
          <div className="foot">Positions needing overtime or hiring</div>
        </div>
        <div className="tile">
          <div className="label">Unlockable by cross-training</div>
          <div className="value sm">{o.crossTrainingHoursPerWeek.toLocaleString()} h</div>
          <div className="foot">Idle capacity blocked only by certification</div>
        </div>
      </div>

      <div className="card">
        <h2>Recommended redistribution</h2>
        <div className="sub">
          Moves stay within a shift and respect cross-training — you cannot solve an evening
          shortage with morning people, or put uncertified staff on equipment.
        </div>
        {o.moves.length === 0 && <div className="state">No redistribution possible at this scenario.</div>}
        {o.moves.map((m, i) => (
          <div className="move" key={i}>
            <div className="n">{m.people}</div>
            <div className="txt">
              <b style={{ textTransform: 'capitalize' }}>{m.from}</b> → <b style={{ textTransform: 'capitalize' }}>{m.to}</b>
              {' '}on <b>{m.shift}</b> · {m.hoursPerDay} person-hours/day
              <div className="why">{m.rationale}</div>
            </div>
          </div>
        ))}
        {o.moves.length > 0 && (
          <button className="btn ghost" style={{ marginTop: 8 }} onClick={() => csv(data.plan, o, site)}>
            Export plan as CSV
          </button>
        )}
      </div>

      <div className="grid k2">
        <div className="card" style={{ marginBottom: 0 }}>
          <h2>Cross-training opportunities</h2>
          <div className="sub">
            Capacity the business already pays for but cannot legally deploy — the highest-return
            action in this whole view
          </div>
          {o.crossTraining.length === 0 && <div className="state">No skill-blocked capacity found.</div>}
          {o.crossTraining.map((c, i) => (
            <div className="move" key={i}>
              <div className="n">{c.people}</div>
              <div className="txt">
                Train <b style={{ textTransform: 'capitalize' }}>{c.trainFrom}</b> staff to cover{' '}
                <b style={{ textTransform: 'capitalize' }}>{c.toCover}</b> on <b>{c.shift}</b>
                <div className="why">{c.detail} Unlocks {c.hoursUnlockedPerWeek} person-hours/week.</div>
              </div>
            </div>
          ))}
        </div>

        <div className="card" style={{ marginBottom: 0 }}>
          <h2>Utilisation outliers</h2>
          <div className="sub">Under- and over-utilised areas, as the brief asks</div>
          {o.flags.length === 0 && <div className="state">All areas within target utilisation.</div>}
          {o.flags.map((f, i) => (
            <div className={`alert ${f.type === 'over-utilised' ? 'high' : 'medium'}`} key={i}>
              <div>
                <div className="t">{f.area} — {f.type} ({pct(f.utilisation)})</div>
                <div className="d">{f.detail}</div>
              </div>
            </div>
          ))}

          {o.residualShortfall.length > 0 && (
            <>
              <h2 style={{ marginTop: 18 }}>Genuine capacity gap</h2>
              <div className="sub">What redistribution honestly cannot fix</div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Function</th><th>Shift</th><th className="num">People</th></tr>
                  </thead>
                  <tbody>
                    {o.residualShortfall.map((r, i) => (
                      <tr key={i}>
                        <td style={{ textTransform: 'capitalize' }}>{r.functionType}</td>
                        <td>{r.shift}</td>
                        <td className="num"><b>{r.people}</b></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
