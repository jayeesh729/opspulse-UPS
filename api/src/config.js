// Reference data for OpsPulse.
// NOTE: everything here is site / function / shift level. There is deliberately no
// employee-level entity anywhere in this system - the brief states the tool is not
// intended to measure or evaluate individual employee productivity.

export const FUNCTIONS = ['inbound', 'outbound', 'inventory'];

export const SITES = [
  { code: 'MAA', name: 'Chennai Hub', region: 'South' },
  { code: 'BOM', name: 'Mumbai Hub', region: 'West' },
  { code: 'DEL', name: 'Delhi Hub', region: 'North' },
  { code: 'BLR', name: 'Bengaluru Hub', region: 'South' },
];

export const SHIFTS = [
  { name: 'Morning', startHour: 6, hours: 8, share: 0.4 },
  { name: 'Evening', startHour: 14, hours: 8, share: 0.4 },
  { name: 'Night', startHour: 22, hours: 8, share: 0.2 },
];

// Engineered labour standards: units a trained person processes per productive hour.
// This is the benchmark the brief says is missing - the "measurable yardstick".
export const STANDARDS = {
  inbound: { unitsPerPersonHour: 45, targetUtilisation: 0.85, absenteeismPct: 0.08 },
  outbound: { unitsPerPersonHour: 38, targetUtilisation: 0.85, absenteeismPct: 0.08 },
  inventory: { unitsPerPersonHour: 60, targetUtilisation: 0.8, absenteeismPct: 0.06 },
};

// Typical daily volume per site per function, before seasonality and trend.
export const BASE_VOLUME = {
  MAA: { inbound: 12000, outbound: 10500, inventory: 6000 },
  BOM: { inbound: 16500, outbound: 15200, inventory: 8200 },
  DEL: { inbound: 14000, outbound: 12800, inventory: 7100 },
  BLR: { inbound: 9500, outbound: 8800, inventory: 4900 },
};

// Monday is the heaviest day, Sunday the lightest - a real parcel-network pattern.
export const WEEKDAY_FACTOR = [0.55, 1.18, 1.1, 1.05, 1.08, 1.15, 0.85]; // Sun..Sat

export const OEI_WEIGHTS = { efficiency: 0.5, utilisation: 0.3, onTime: 0.2 };

export const SCENARIOS = [
  { key: 'low', label: 'Low season', multiplier: 0.8 },
  { key: 'normal', label: 'Normal', multiplier: 1.0 },
  { key: 'peak', label: 'Peak season', multiplier: 1.4 },
  { key: 'surge', label: 'Holiday surge', multiplier: 1.8 },
];

export const ROLES = {
  manager: { label: 'Ops Manager', canWrite: true, allSites: false },
  planner: { label: 'Workforce Planner', canWrite: true, allSites: true },
  leader: { label: 'Operations Leader', canWrite: false, allSites: true },
  admin: { label: 'Admin', canWrite: true, allSites: true, canReset: true },
};

export const SEED = 20260909;
export const HISTORY_DAYS = 120;
