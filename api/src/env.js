import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Load api/.env regardless of the working directory the process was started from.
// `dotenv/config` resolves against cwd, which breaks under `npm --prefix`, under a
// container WORKDIR, and under Kubernetes - all three of which we use.
const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '..', '.env') });
