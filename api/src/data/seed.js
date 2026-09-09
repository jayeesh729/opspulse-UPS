import '../env.js';
import mongoose from 'mongoose';
import { connectDb } from '../db.js';
import { Site, Standard, Operation, Workforce } from '../models/index.js';
import { SITES } from '../config.js';
import { generateOperations, generateStandards, generateWorkforce } from './generate.js';

/**
 * Rebuilds the entire demo dataset from the deterministic generator.
 *
 * Used by `npm run seed` and by POST /api/admin/reset-demo. Because the generator is
 * seeded, this restores byte-identical state every time - which is what makes it safe
 * to demo twice, or after someone has clicked around the app.
 */
export async function seedDatabase() {
  const started = Date.now();

  const operations = generateOperations();
  const standards = generateStandards();
  // Workforce is calibrated against the generated history, so supply and demand are
  // on the same scale and the imbalance is distributional rather than absolute.
  const workforce = generateWorkforce(operations);

  await Promise.all([
    Site.deleteMany({}),
    Standard.deleteMany({}),
    Operation.deleteMany({}),
    Workforce.deleteMany({}),
  ]);

  await Site.insertMany(SITES);
  await Standard.insertMany(standards);
  await Workforce.insertMany(workforce);

  // Chunked so a single oversized batch never trips the Atlas request limit.
  const chunk = 500;
  for (let i = 0; i < operations.length; i += chunk) {
    await Operation.insertMany(operations.slice(i, i + chunk), { ordered: false });
  }

  return {
    sites: SITES.length,
    standards: standards.length,
    workforce: workforce.length,
    operations: operations.length,
    ms: Date.now() - started,
  };
}

// Allow running this file directly: `npm run seed`
const isDirectRun = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('src/data/seed.js');
if (isDirectRun) {
  try {
    await connectDb(process.env.MONGODB_URI);
    const result = await seedDatabase();
    console.log('Seeded:', result);
  } catch (err) {
    console.error('Seed failed:', err.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}
