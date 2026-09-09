import mongoose from 'mongoose';
import { FUNCTIONS } from '../config.js';

// Layer 2 of validation: even if a route handler has a bug, the database
// itself refuses malformed documents. Zod guards the edge, this guards the data.

const siteSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, match: /^[A-Z]{3}$/ },
    name: { type: String, required: true, maxlength: 80 },
    region: { type: String, required: true, maxlength: 40 },
  },
  { timestamps: true }
);

const standardSchema = new mongoose.Schema({
  siteCode: { type: String, required: true, match: /^[A-Z]{3}$/ },
  functionType: { type: String, required: true, enum: FUNCTIONS },
  unitsPerPersonHour: { type: Number, required: true, min: 1, max: 1000 },
  targetUtilisation: { type: Number, required: true, min: 0.1, max: 1 },
  absenteeismPct: { type: Number, required: true, min: 0, max: 0.5 },
});
standardSchema.index({ siteCode: 1, functionType: 1 }, { unique: true });

// The fact table. One row per site / function / day - never per person.
const operationSchema = new mongoose.Schema({
  siteCode: { type: String, required: true, match: /^[A-Z]{3}$/ },
  functionType: { type: String, required: true, enum: FUNCTIONS },
  date: { type: Date, required: true },
  units: { type: Number, required: true, min: 0 },
  labourHours: { type: Number, required: true, min: 0 },
  headcount: { type: Number, required: true, min: 0 },
  onTimePct: { type: Number, required: true, min: 0, max: 1 },
});
operationSchema.index({ siteCode: 1, functionType: 1, date: 1 }, { unique: true });

const workforceSchema = new mongoose.Schema({
  siteCode: { type: String, required: true, match: /^[A-Z]{3}$/ },
  functionType: { type: String, required: true, enum: FUNCTIONS },
  shift: { type: String, required: true, enum: ['Morning', 'Evening', 'Night'] },
  availableHeadcount: { type: Number, required: true, min: 0, max: 500 },
  // Which other functions this pool is cross-trained for - constrains redistribution.
  skills: [{ type: String, enum: FUNCTIONS }],
});
workforceSchema.index({ siteCode: 1, functionType: 1, shift: 1 }, { unique: true });

export const Site = mongoose.model('Site', siteSchema);
export const Standard = mongoose.model('Standard', standardSchema);
export const Operation = mongoose.model('Operation', operationSchema);
export const Workforce = mongoose.model('Workforce', workforceSchema);
