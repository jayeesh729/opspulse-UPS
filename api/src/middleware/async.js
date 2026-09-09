/**
 * Express 4 does not catch rejected promises from async route handlers. The rejection
 * escapes as an unhandled rejection, and Node exits the process on those by default -
 * so a single transient database error took down the whole pod.
 *
 * Wrapping forwards the rejection to Express's error handler, which returns a 500 and
 * keeps the process alive. Express 5 does this natively; we are on 4.
 */
export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
