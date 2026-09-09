import './env.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import mongoSanitize from 'express-mongo-sanitize';
import { connectDb, dbState } from './db.js';
import api from './routes/index.js';
import authRoutes from './routes/auth.js';

const app = express();
const PORT = process.env.PORT || 8000;

// --- Security middleware chain -------------------------------------------------
app.disable('x-powered-by');
app.use(helmet());                                   // security headers
app.use(
  cors({
    origin: process.env.WEB_ORIGIN ? process.env.WEB_ORIGIN.split(',') : true,
    allowedHeaders: ['Content-Type', 'Authorization'], // explicit origin, never a bare wildcard in prod
  })
);
app.use(express.json({ limit: '100kb' }));           // payload cap
app.use(mongoSanitize());                            // strips $ and . - blocks NoSQL injection

// Liveness/readiness probes sit ahead of the rate limiter so Kubernetes can never
// throttle itself out of a healthy pod.
app.get('/api/health', (req, res) =>
  res.json({ status: 'ok', service: 'opspulse-api', db: dbState(), uptimeSec: Math.round(process.uptime()) })
);

app.use(rateLimit({ windowMs: 60_000, max: 300, standardHeaders: true, legacyHeaders: false }));

// Sign-in is public; everything under /api requires a token.
app.use('/api/auth', authRoutes);
app.use('/api', api);

// --- Single-service mode (cloud deploy) ----------------------------------------
// When a built frontend is present next to the API, serve it from the same origin.
// That gives one public URL with no CORS between tiers, which is what we want on
// Render. Locally the frontend runs on Vite and in Docker it is served by nginx,
// so web/dist does not exist there and this block is simply skipped.
const here = path.dirname(fileURLToPath(import.meta.url));
const webDist = path.resolve(here, '../../web/dist');

if (fs.existsSync(webDist)) {
  console.log('serving built frontend from', webDist);
  app.use(express.static(webDist));
  // SPA fallback: any non-API path returns index.html so client-side routing works.
  app.get('*', (req, res, next) =>
    req.path.startsWith('/api') ? next() : res.sendFile(path.join(webDist, 'index.html'))
  );
}

app.use((req, res) => res.status(404).json({ error: 'Not found', path: req.path }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[error]', err.message);
  res.status(500).json({ error: 'Internal server error' }); // never leak a stack trace
});

// --- Startup -------------------------------------------------------------------
// The API listens even if Mongo is briefly unreachable, so the readiness probe can
// report honestly instead of the container crash-looping on a transient DB blip.
app.listen(PORT, '0.0.0.0', () => console.log(`opspulse-api listening on :${PORT}`));

connectDb(process.env.MONGODB_URI)
  .then(() => console.log('mongo connected:', dbState()))
  .catch((err) => console.error('mongo connection failed:', err.message));
