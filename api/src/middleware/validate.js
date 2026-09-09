// Validation layer 1: nothing untrusted reaches business logic.
// Every query string and body is parsed against a Zod schema; failures return a
// field-level 400 rather than a stack trace.

export const validate = (schema, source = 'query') => (req, res, next) => {
  const result = schema.safeParse(req[source]);
  if (!result.success) {
    return res.status(400).json({
      error: 'Validation failed',
      details: result.error.issues.map((i) => ({
        field: i.path.join('.') || source,
        message: i.message,
      })),
    });
  }
  req.validated = { ...(req.validated ?? {}), ...result.data };
  next();
};
