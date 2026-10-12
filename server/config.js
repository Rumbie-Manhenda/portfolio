'use strict';

/* config — reads the environment (and .env) and exposes one immutable
 * settings object the rest of the server uses.
 */

const path = require('path');
const { loadEnv } = require('./loadEnv');

const ROOT = path.resolve(__dirname, '..'); // => portfolio/
loadEnv(path.join(ROOT, '.env'));

/** Parse a value into a boolean, falling back when it is unset/unknown. */
function toBoolean(value, fallback) {
  if (value === undefined || value === '') return fallback;
  return /^(1|true|yes|on)$/i.test(String(value).trim());
}

/** Parse a value into an integer, falling back when it is not a number. */
function toInteger(value, fallback) {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Split a comma-separated list into a trimmed, non-empty array. */
function toList(value, fallback) {
  const raw = value === undefined || value === '' ? fallback : value;
  return String(raw)
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
}

const smtp = {
  host: process.env.SMTP_HOST || '',
  port: toInteger(process.env.SMTP_PORT, 587),
  secure: toBoolean(process.env.SMTP_SECURE, false),
  user: process.env.SMTP_USER || '',
  pass: process.env.SMTP_PASS || '',
};

const mailFrom = process.env.MAIL_FROM || smtp.user || '';
const mailTo = process.env.MAIL_TO || 'pattymcharis15@gmail.com';

const config = {
  root: ROOT,
  port: toInteger(process.env.PORT, 3000),
  smtp,
  mailFrom,
  mailTo,
  allowedOrigins: toList(process.env.ALLOWED_ORIGINS, '*'),
  rateLimitDisabled: toBoolean(process.env.RATE_LIMIT_DISABLED, false),
};

// Email can only be delivered once the SMTP host, credentials, sender and
// recipient are all present. Anything missing means the form should fail with
// a clear message rather than silently pretending to work.
config.smtpConfigured = Boolean(
  smtp.host && smtp.user && smtp.pass && mailFrom && mailTo
);

module.exports = config;
