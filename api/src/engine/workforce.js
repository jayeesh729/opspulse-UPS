import { SHIFTS } from '../config.js';

// Smart workforce planning: turn forecast volume into a headcount requirement.
//
// The chain is the one a labour planner actually uses:
//   units -> productive hours (via the engineered standard)
//         -> paid hours (divided by target utilisation, since nobody is productive
//            100% of a paid shift)
//         -> headcount (divided by shift length, uplifted for expected absenteeism)

export function buildWorkforcePlan({ forecastByFunction, standardsByFunction, workforce, scenario = 1 }) {
  const rows = [];

  for (const [functionType, dailyUnits] of Object.entries(forecastByFunction)) {
    const std = standardsByFunction[functionType];
    if (!std) continue;

    for (const shift of SHIFTS) {
      const units = dailyUnits * shift.share * scenario;
      const productiveHours = units / std.unitsPerPersonHour;
      const paidHours = productiveHours / std.targetUtilisation;
      const required = Math.max(1, Math.ceil((paidHours / shift.hours) * (1 + std.absenteeismPct)));

      const pool = workforce.find((w) => w.functionType === functionType && w.shift === shift.name);
      const available = pool ? pool.availableHeadcount : 0;

      rows.push({
        functionType,
        shift: shift.name,
        forecastUnits: Math.round(units),
        productiveHours: Math.round(productiveHours * 10) / 10,
        paidHours: Math.round(paidHours * 10) / 10,
        required,
        available,
        gap: available - required, // negative = short
        utilisationIfUnchanged: available > 0
          ? Math.round((productiveHours / (available * shift.hours)) * 1000) / 1000
          : 0,
        skills: pool?.skills ?? [],
      });
    }
  }

  return rows;
}

export function planSummary(rows) {
  const required = rows.reduce((a, r) => a + r.required, 0);
  const available = rows.reduce((a, r) => a + r.available, 0);
  const short = rows.filter((r) => r.gap < 0).reduce((a, r) => a + Math.abs(r.gap), 0);
  const surplus = rows.filter((r) => r.gap > 0).reduce((a, r) => a + r.gap, 0);
  return { required, available, netGap: available - required, shortPositions: short, surplusPositions: surplus };
}

export const SHIFT_HOURS = SHIFTS[0].hours;
