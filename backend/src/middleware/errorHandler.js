// Centralized error handler — every route wraps its logic in try/catch and
// calls next(err), so error formatting only lives in one place.
export const errorHandler = (err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error(err);

  if (err.code === '23505') {
    // Postgres unique_violation
    return res.status(409).json({ error: 'A record with that value already exists' });
  }

  const status = err.status || 500;
  const message = status === 500 ? 'Internal server error' : err.message;
  res.status(status).json({ error: message });
};

export const notFoundHandler = (req, res) => {
  res.status(404).json({ error: `No route for ${req.method} ${req.originalUrl}` });
};
