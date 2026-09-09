import './env.js';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import mongoSanitize from 'express-mongo-sanitize';
import { connectDb, dbState } from './db.js';
import api from './routes/index.js';

const app = express();
const PORT = process.env.PORT || 8000;

// --- Security middleware chain -------------------------------------------------
app.disable('x-powered-by');
app.use(helmet());                                   // security headers
app.use(
  cors({
    origin: process.env.WEB_ORIGIN ? process.env.WEB_ORIGIN.split(',') : true,
    allowedHeaders: ['Content-Type', 'X-Role'],      // explicit origin, never a bare wildcard in prod
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
app.use('/api', api);

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
