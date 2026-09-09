import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import { optimise } from '../src/engine/optimize.js';
import { buildWorkforcePlan, SHIFT_HOURS } from '../src/engine/workforce.js';
import { buildForecast } from '../src/engine/forecast.js';
import { generateOperations, generateWorkforce } from '../src/data/generate.js';
import { STANDARDS, SITES, FUNCTIONS, SCENARIOS } from '../src/config.js';

const OPS = generateOperations();
const WORKFORCE = generateWorkforce(OPS);

function planFor(site, scenario) {
  const forecastByFunction = {};
  for (const fn of FUNCTIONS) {
    const f = buildForecast(OPS.filter((o) => o.siteCode === site && o.functionType === fn), 1);
    forecastByFunction[fn] = f.length ? f[0].units : 0;
  }
  return buildWorkforcePlan({
    forecastByFunction,
    standardsByFunction: STANDARDS,
    workforce: WORKFORCE.filter((w) => w.siteCode === site),
    scenario,
  });
}

/** Every site x every offered scenario - the full space the UI can produce. */
const CASES = SITES.flatMap((s) => SCENARIOS.map((sc) => ({ label: `${s.code}/${sc.key}`, plan: planFor(s.code, sc.multiplier) })));

const totalDeficit = (plan) => plan.filter((r) => r.gap < 0).reduce((a, r) => a + Math.abs(r.gap), 0);
const totalSurplus = (plan) => plan.filter((r) => r.gap > 0).reduce((a, r) => a + r.gap, 0);

/** Hand-built plan rows, so the constraints can be exercised in isolation. */
const planRow = (over) => ({
  functionType: 'inbound',
  shift: 'Morning',
  forecastUnits: 1000,
  productiveHours: 20,
  paidHours: 24,
  required: 10,
  available: 10,
  gap: 0,
  utilisationIfUnchanged: 0.8,
  skills: [],
  ...over,
});

describe('optimise - invariants on real plans', () => {
  test('never moves more people than the total available surplus', () => {
    for (const { label, plan } of CASES) {
      const r = optimise(plan);
      assert.ok(
        r.peopleMoved <= totalSurplus(plan),
        `${label}: moved ${r.peopleMoved} but only ${totalSurplus(plan)} surplus exist`
      );
      assert.ok(r.peopleMoved >= 0);
    }
  });

  test('no move ever violates the cross-training constraint', () => {
    for (const { label, plan } of CASES) {
      for (const move of optimise(plan).moves) {
        const source = plan.find((r) => r.functionType === move.from && r.shift === move.shift);
        assert.ok(source, `${label}: move from an area not in the plan`);
        assert.ok(
          source.skills.includes(move.to),
          `${label}: moved ${move.people} from ${move.from} to ${move.to} on ${move.shift}, ` +
            `but ${move.from} is only certified for [${source.skills.join(', ')}]`
        );
      }
    }
  });

  test('no move ever crosses shifts', () => {
    for (const { label, plan } of CASES) {
      for (const move of optimise(plan).moves) {
        const source = plan.find((r) => r.functionType === move.from && r.shift === move.shift);
        const target = plan.find((r) => r.functionType === move.to && r.shift === move.shift);
        assert.ok(source, `${label}: source ${move.from} not on shift ${move.shift}`);
        assert.ok(target, `${label}: target ${move.to} not on shift ${move.shift}`);
        assert.equal(source.shift, target.shift, `${label}: ${move.from} -> ${move.to} crosses shifts`);
        assert.ok(source.gap > 0, `${label}: ${move.from} on ${move.shift} had no surplus to give`);
        assert.ok(target.gap < 0, `${label}: ${move.to} on ${move.shift} was not short`);
      }
    }
  });

  test('residualPeople + peopleMoved equals the original total deficit', () => {
    for (const { label, plan } of CASES) {
      const r = optimise(plan);
      assert.equal(
        r.peopleMoved + r.residualPeople,
        totalDeficit(plan),
        `${label}: ${r.peopleMoved} moved + ${r.residualPeople} residual != ${totalDeficit(plan)} deficit`
      );
    }
  });

  test('mode is capacity-shortfall exactly when people are still short', () => {
    let sawBoth = { shortfall: false, sufficient: false };
    for (const { label, plan } of CASES) {
      const r = optimise(plan);
      assert.equal(
        r.recommendation.mode === 'capacity-shortfall',
        r.residualPeople > 0,
        `${label}: mode ${r.recommendation.mode} with residualPeople ${r.residualPeople}`
      );
      if (r.residualPeople > 0) sawBoth.shortfall = true;
      else sawBoth.sufficient = true;
    }
    assert.ok(sawBoth.shortfall && sawBoth.sufficient, 'the generated demo data should exercise both modes');
  });

  test('every move relocates a positive whole number of people', () => {
    for (const { label, plan } of CASES) {
      for (const move of optimise(plan).moves) {
        assert.ok(Number.isInteger(move.people) && move.people > 0, `${label}: bogus move size ${move.people}`);
        assert.equal(move.hoursPerDay, move.people * SHIFT_HOURS, `${label}: hoursPerDay does not match`);
      }
    }
  });

  test('a receiving area never gets more people than it was short of', () => {
    for (const { label, plan } of CASES) {
      const received = new Map();
      for (const m of optimise(plan).moves) {
        const key = `${m.to}|${m.shift}`;
        received.set(key, (received.get(key) ?? 0) + m.people);
      }
      for (const [key, people] of received) {
        const [fn, shift] = key.split('|');
        const target = plan.find((r) => r.functionType === fn && r.shift === shift);
        assert.ok(people <= -target.gap, `${label}: ${key} received ${people} for a shortfall of ${-target.gap}`);
      }
    }
  });

  test('a donating area never gives away more than its surplus', () => {
    for (const { label, plan } of CASES) {
      const given = new Map();
      for (const m of optimise(plan).moves) {
        const key = `${m.from}|${m.shift}`;
        given.set(key, (given.get(key) ?? 0) + m.people);
      }
      for (const [key, people] of given) {
        const [fn, shift] = key.split('|');
        const source = plan.find((r) => r.functionType === fn && r.shift === shift);
        assert.ok(people <= source.gap, `${label}: ${key} gave ${people} from a surplus of ${source.gap}`);
      }
    }
  });

  test('idle capacity is the surplus that was not moved', () => {
    for (const { label, plan } of CASES) {
      const r = optimise(plan);
      assert.equal(r.idlePeople + r.peopleMoved, totalSurplus(plan), `${label}`);
      assert.equal(r.idlePeople, r.idleCapacity.reduce((a, i) => a + i.people, 0), `${label}: idlePeople mismatch`);
    }
  });

  test('reclaimed hours follow directly from the people moved', () => {
    for (const { label, plan } of CASES) {
      const r = optimise(plan);
      assert.equal(r.hoursReclaimedPerDay, r.peopleMoved * SHIFT_HOURS, label);
      assert.equal(r.hoursReclaimedPerWeek, r.hoursReclaimedPerDay * 7, label);
    }
  });

  test('the recommendation numbers are consistent and finite', () => {
    for (const { label, plan } of CASES) {
      const { recommendation: rec, residualPeople } = optimise(plan);
      assert.equal(rec.temporaryHires, residualPeople, label);
      assert.equal(rec.overtimeHoursPerWeek, residualPeople * SHIFT_HOURS * 7, label);
      assert.equal(rec.fteEquivalent, Math.round((residualPeople * SHIFT_HOURS * 7) / 40 * 10) / 10, label);
      assert.ok(Number.isFinite(rec.fteEquivalent), label);
      assert.ok(rec.priorityAreas.length <= 3, label);
      assert.ok(!rec.headline.includes('NaN') && !rec.headline.includes('undefined'), `${label}: ${rec.headline}`);
      for (let i = 1; i < rec.priorityAreas.length; i++) {
        assert.ok(rec.priorityAreas[i].people <= rec.priorityAreas[i - 1].people, `${label}: priority areas not sorted`);
      }
    }
  });

  test('cross-training suggestions never exceed the idle capacity they draw on', () => {
    for (const { label, plan } of CASES) {
      const r = optimise(plan);
      const suggested = r.crossTraining.reduce((a, c) => a + c.people, 0);
      assert.ok(suggested <= r.idlePeople, `${label}: suggests training ${suggested} people from ${r.idlePeople} idle`);
      for (const c of r.crossTraining) {
        assert.notEqual(c.trainFrom, c.toCover, `${label}: suggests training a pool for its own function`);
        assert.equal(c.hoursUnlockedPerWeek, c.people * SHIFT_HOURS * 7, label);
      }
    }
  });

  test('residual shortfall only ever names areas that are actually short', () => {
    for (const { label, plan } of CASES) {
      for (const s of optimise(plan).residualShortfall) {
        const target = plan.find((r) => r.functionType === s.functionType && r.shift === s.shift);
        assert.ok(target && target.gap < 0, `${label}: residual for a non-short area`);
        assert.ok(s.people > 0 && s.people <= -target.gap, `${label}: residual ${s.people} vs gap ${target.gap}`);
      }
    }
  });
});

describe('optimise - constraint behaviour in isolation', () => {
  test('will not move people across shifts even when the skill matches', () => {
    const plan = [
      planRow({ functionType: 'inbound', shift: 'Morning', available: 15, required: 10, gap: 5, skills: ['inbound', 'outbound'] }),
      planRow({ functionType: 'outbound', shift: 'Evening', available: 6, required: 11, gap: -5, skills: ['inbound', 'outbound'] }),
    ];
    const r = optimise(plan);
    assert.deepEqual(r.moves, [], 'a Morning surplus must not cover an Evening shortage');
    assert.equal(r.peopleMoved, 0);
    assert.equal(r.residualPeople, 5);
    assert.equal(r.idlePeople, 5);
    assert.equal(r.recommendation.mode, 'capacity-shortfall');
  });

  test('will not move people who lack the certification', () => {
    // inbound staff are not certified for inventory
    const plan = [
      planRow({ functionType: 'inbound', shift: 'Morning', gap: 4, skills: ['inbound', 'outbound'] }),
      planRow({ functionType: 'inventory', shift: 'Morning', gap: -4, skills: ['inventory', 'inbound'] }),
    ];
    const r = optimise(plan);
    assert.deepEqual(r.moves, []);
    assert.equal(r.residualPeople, 4);
    assert.equal(r.crossTraining.length, 1);
    assert.equal(r.crossTraining[0].trainFrom, 'inbound');
    assert.equal(r.crossTraining[0].toCover, 'inventory');
    assert.equal(r.crossTraining[0].people, 4);
  });

  test('moves people when the certification allows it', () => {
    // inventory staff hold equipment certification and can cover inbound
    const plan = [
      planRow({ functionType: 'inventory', shift: 'Morning', gap: 6, skills: ['inventory', 'inbound'] }),
      planRow({ functionType: 'inbound', shift: 'Morning', gap: -4, skills: ['inbound', 'outbound'] }),
    ];
    const r = optimise(plan);
    assert.equal(r.moves.length, 1);
    assert.deepEqual(
      { from: r.moves[0].from, to: r.moves[0].to, people: r.moves[0].people, shift: r.moves[0].shift },
      { from: 'inventory', to: 'inbound', people: 4, shift: 'Morning' }
    );
    assert.equal(r.peopleMoved, 4);
    assert.equal(r.residualPeople, 0);
    assert.equal(r.idlePeople, 2);
    assert.equal(r.recommendation.mode, 'redistribution-sufficient');
    assert.equal(r.recommendation.temporaryHires, 0);
  });

  test('splits one shortage across several certified donors', () => {
    const plan = [
      planRow({ functionType: 'inventory', shift: 'Night', gap: 3, skills: ['inventory', 'inbound'] }),
      planRow({ functionType: 'outbound', shift: 'Night', gap: 2, skills: ['inbound', 'outbound'] }),
      planRow({ functionType: 'inbound', shift: 'Night', gap: -5, skills: ['inbound', 'outbound'] }),
    ];
    const r = optimise(plan);
    assert.equal(r.peopleMoved, 5);
    assert.equal(r.residualPeople, 0);
    assert.equal(r.idlePeople, 0);
    assert.equal(new Set(r.moves.map((m) => m.from)).size, 2);
  });

  test('reports the unclosable part of a shortage rather than dropping it', () => {
    const plan = [
      planRow({ functionType: 'inventory', shift: 'Morning', gap: 2, skills: ['inventory', 'inbound'] }),
      planRow({ functionType: 'inbound', shift: 'Morning', gap: -7, skills: ['inbound', 'outbound'] }),
    ];
    const r = optimise(plan);
    assert.equal(r.peopleMoved, 2);
    assert.equal(r.residualPeople, 5);
    assert.deepEqual(r.residualShortfall, [{ functionType: 'inbound', shift: 'Morning', people: 5 }]);
    assert.equal(r.recommendation.mode, 'capacity-shortfall');
    assert.equal(r.recommendation.temporaryHires, 5);
    assert.equal(r.recommendation.overtimeHoursPerWeek, 5 * SHIFT_HOURS * 7);
  });

  test('a balanced roster produces no moves and no shortfall', () => {
    const plan = [
      planRow({ functionType: 'inbound', shift: 'Morning', gap: 0, skills: ['inbound', 'outbound'] }),
      planRow({ functionType: 'outbound', shift: 'Morning', gap: 0, skills: ['inbound', 'outbound'] }),
    ];
    const r = optimise(plan);
    assert.equal(r.peopleMoved, 0);
    assert.equal(r.residualPeople, 0);
    assert.equal(r.idlePeople, 0);
    assert.equal(r.recommendation.mode, 'redistribution-sufficient');
    assert.equal(r.recommendation.headline, 'Roster already matches the forecast workload in every area.');
  });

  test('an empty plan is handled without throwing', () => {
    const r = optimise([]);
    assert.deepEqual(r.moves, []);
    assert.equal(r.peopleMoved, 0);
    assert.equal(r.residualPeople, 0);
    assert.equal(r.idlePeople, 0);
    assert.deepEqual(r.flags, []);
    assert.equal(r.recommendation.mode, 'redistribution-sufficient');
  });

  test('keeps each shift independent when both have imbalances', () => {
    const plan = [
      planRow({ functionType: 'inventory', shift: 'Morning', gap: 5, skills: ['inventory', 'inbound'] }),
      planRow({ functionType: 'inbound', shift: 'Morning', gap: -2, skills: ['inbound', 'outbound'] }),
      planRow({ functionType: 'inventory', shift: 'Evening', gap: -3, skills: ['inventory', 'inbound'] }),
      planRow({ functionType: 'inbound', shift: 'Evening', gap: 1, skills: ['inbound', 'outbound'] }),
    ];
    const r = optimise(plan);
    assert.equal(r.moves.length, 1);
    assert.equal(r.moves[0].shift, 'Morning');
    assert.equal(r.peopleMoved, 2);
    assert.equal(r.residualPeople, 3, 'the Evening inventory shortage cannot be covered');
    assert.deepEqual(r.residualShortfall, [{ functionType: 'inventory', shift: 'Evening', people: 3 }]);
  });

  test('flags under- and over-utilised areas from the projected utilisation', () => {
    const plan = [
      planRow({ functionType: 'inbound', shift: 'Morning', utilisationIfUnchanged: 0.55 }),
      planRow({ functionType: 'outbound', shift: 'Morning', utilisationIfUnchanged: 0.99 }),
      planRow({ functionType: 'inventory', shift: 'Morning', utilisationIfUnchanged: 0.85 }),
      planRow({ functionType: 'inbound', shift: 'Night', utilisationIfUnchanged: 0 }),
    ];
    const r = optimise(plan);
    assert.equal(r.flags.length, 2);
    assert.deepEqual(
      r.flags.map((f) => [f.type, f.area]),
      [
        ['under-utilised', 'inbound / Morning'],
        ['over-utilised', 'outbound / Morning'],
      ]
    );
  });
});
