import { SHIFT_HOURS } from './workforce.js';

// Resource optimisation.
//
// Greedy surplus-to-deficit matching, constrained two ways so the recommendations are
// operationally real rather than arithmetic:
//   1. Moves stay WITHIN a shift. You cannot solve an evening shortage with morning people.
//   2. Moves respect cross-training. An inventory pool certified on equipment can cover
//      inbound, but an inbound pool cannot cover inventory.
//
// Whatever redistribution cannot solve is reported as a genuine hiring or overtime
// requirement rather than quietly dropped - that residual is the honest output.

export function optimise(plan) {
  const shifts = [...new Set(plan.map((r) => r.shift))];
  const moves = [];
  const residualShortfall = [];
  const idleCapacity = [];

  for (const shift of shifts) {
    const rows = plan.filter((r) => r.shift === shift);

    const surplus = rows
      .filter((r) => r.gap > 0)
      .map((r) => ({ functionType: r.functionType, skills: r.skills, left: r.gap }))
      .sort((a, b) => b.left - a.left);

    const deficit = rows
      .filter((r) => r.gap < 0)
      .map((r) => ({ functionType: r.functionType, need: -r.gap }))
      .sort((a, b) => b.need - a.need);

    for (const d of deficit) {
      for (const s of surplus) {
        if (d.need <= 0) break;
        if (s.left <= 0) continue;
        if (!s.skills.includes(d.functionType)) continue; // not cross-trained

        const people = Math.min(s.left, d.need);
        moves.push({
          shift,
          from: s.functionType,
          to: d.functionType,
          people,
          hoursPerDay: people * SHIFT_HOURS,
          rationale: `${s.functionType} has spare capacity on ${shift} and is cross-trained for ${d.functionType}.`,
        });
        s.left -= people;
        d.need -= people;
      }
      if (d.need > 0) {
        residualShortfall.push({ functionType: d.functionType, shift, people: d.need });
      }
    }

    for (const s of surplus) {
      if (s.left > 0) idleCapacity.push({ functionType: s.functionType, shift, people: s.left });
    }
  }

  // Idle capacity that could NOT be used because the pool lacks the certification.
  // This is the most actionable finding in the whole engine: it names the specific
  // cross-training that would unlock capacity the business already pays for.
  const crossTraining = [];
  for (const short of residualShortfall) {
    const stranded = idleCapacity.filter((i) => i.shift === short.shift && i.functionType !== short.functionType);
    for (const idle of stranded) {
      const unlockable = Math.min(idle.people, short.people);
      if (unlockable <= 0) continue;
      crossTraining.push({
        shift: short.shift,
        trainFrom: idle.functionType,
        toCover: short.functionType,
        people: unlockable,
        hoursUnlockedPerWeek: unlockable * SHIFT_HOURS * 7,
        detail: `${idle.people} idle in ${idle.functionType} on ${short.shift} are not certified for ${short.functionType}.`,
      });
    }
  }

  const peopleMoved = moves.reduce((a, m) => a + m.people, 0);
  const hoursPerDay = peopleMoved * SHIFT_HOURS;

  const flags = [];
  for (const r of plan) {
    if (r.utilisationIfUnchanged > 0 && r.utilisationIfUnchanged < 0.7) {
      flags.push({
        type: 'under-utilised',
        area: `${r.functionType} / ${r.shift}`,
        utilisation: r.utilisationIfUnchanged,
        detail: `${Math.round(r.utilisationIfUnchanged * 100)}% projected utilisation - capacity is available here.`,
      });
    } else if (r.utilisationIfUnchanged > 0.95) {
      flags.push({
        type: 'over-utilised',
        area: `${r.functionType} / ${r.shift}`,
        utilisation: r.utilisationIfUnchanged,
        detail: `${Math.round(r.utilisationIfUnchanged * 100)}% projected utilisation - no buffer for a volume spike.`,
      });
    }
  }

  const residualPeople = residualShortfall.reduce((a, r) => a + r.people, 0);

  // Under a peak scenario every area is short, so there is no surplus to move and
  // redistribution honestly cannot help. Returning zeros would be technically correct
  // and practically useless, so we convert the shortfall into the decision an
  // operations leader actually has to make: overtime, temporary hires, or both.
  const recommendation = residualPeople > 0
    ? {
        mode: 'capacity-shortfall',
        headline: peopleMoved > 0
          ? `Moving ${peopleMoved} people within existing shifts closes most of the gap; ${residualPeople} positions still need new capacity.`
          : `Redistribution cannot help at this volume - all areas are short. ${residualPeople} positions need new capacity.`,
        temporaryHires: residualPeople,
        overtimeHoursPerWeek: residualPeople * SHIFT_HOURS * 7,
        // Equivalent full-time staff at a 40-hour week, for a budget conversation.
        fteEquivalent: Math.round((residualPeople * SHIFT_HOURS * 7) / 40 * 10) / 10,
        priorityAreas: [...residualShortfall]
          .sort((a, b) => b.people - a.people)
          .slice(0, 3)
          .map((r) => ({ area: `${r.functionType} / ${r.shift}`, people: r.people })),
      }
    : {
        mode: 'redistribution-sufficient',
        headline: peopleMoved > 0
          ? `Forecast workload is fully covered by moving ${peopleMoved} people within existing shifts - no hiring required.`
          : 'Roster already matches the forecast workload in every area.',
        temporaryHires: 0,
        overtimeHoursPerWeek: 0,
        fteEquivalent: 0,
        priorityAreas: [],
      };

  return {
    moves,
    peopleMoved,
    hoursReclaimedPerDay: hoursPerDay,
    hoursReclaimedPerWeek: hoursPerDay * 7, // hubs run seven days
    residualShortfall,
    residualPeople,
    idleCapacity,
    idlePeople: idleCapacity.reduce((a, r) => a + r.people, 0),
    crossTraining,
    crossTrainingHoursPerWeek: crossTraining.reduce((a, c) => a + c.hoursUnlockedPerWeek, 0),
    flags,
    recommendation,
  };
}
