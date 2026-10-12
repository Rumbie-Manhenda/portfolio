'use strict';

/* rateLimit — a tiny in-memory limiter that keeps a public form from being
 * hammered. One bucket per client address, reset after each window. It is
 * self-cleaning so the map cannot grow without bound.
 */

/**
 * @param {object} options
 * @param {number} options.windowMs length of the window in milliseconds
 * @param {number} options.max maximum requests allowed per window and address
 * @param {boolean} [options.disabled] bypass the limiter entirely (tests/dev)
 * @returns {import('express').RequestHandler}
 */
function rateLimit({ windowMs, max, disabled }) {
  const buckets = new Map();

  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (now > bucket.reset) buckets.delete(key);
    }
  }, windowMs);
  // Do not keep the process alive just for cleanup.
  if (typeof cleanup.unref === 'function') cleanup.unref();

  return function limitRequest(req, res, next) {
    if (disabled) return next();

    const key = req.ip || req.socket?.remoteAddress || 'unknown';
    const now = Date.now();
    const bucket = buckets.get(key);

    if (!bucket || now > bucket.reset) {
      buckets.set(key, { count: 1, reset: now + windowMs });
      return next();
    }

    bucket.count += 1;
    if (bucket.count > max) {
      const retryAfter = Math.max(1, Math.ceil((bucket.reset - now) / 1000));
      res.set('Retry-After', String(retryAfter));
      return res
        .status(429)
        .type('text/plain')
        .send('Too many messages from this address. Please wait a few minutes and try again, or email me directly.');
    }

    return next();
  };
}

module.exports = { rateLimit };
