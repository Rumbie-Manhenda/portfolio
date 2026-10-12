'use strict';

/* app — assembles the Express application: security headers, CORS for the
 * API, the contact endpoints, and the static portfolio site itself.
 */

const express = require('express');

const defaultConfig = require('./config');
const mailer = require('./mailer');
const { staticGuard } = require('./staticGuard');
const { createContactRouter } = require('./routes/contact');

/**
 * CORS middleware allowing the browser to post to the API from the site's own
 * origin, from localhost during development, or from any origin when the
 * server is configured with "*". No cookies are involved, so no credentials
 * are allowed.
 *
 * @param {{ allowedOrigins: string[] }} config
 * @returns {import('express').RequestHandler}
 */
function cors(config) {
  const allowAll = config.allowedOrigins.includes('*');

  return function applyCors(req, res, next) {
    const origin = req.headers.origin;

    if (origin && (allowAll || config.allowedOrigins.includes(origin))) {
      res.setHeader('Access-Control-Allow-Origin', allowAll ? '*' : origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Access-Control-Max-Age', '86400');
    }

    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    return next();
  };
}

/** Adds a few conservative security headers to every response. */
function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
}

/**
 * Build the application.
 *
 * @param {object} [options]
 * @param {object} [options.config] settings object (defaults to ./config)
 * @param {import('nodemailer').Transporter | null} [options.transport]
 *        mail transport; when omitted one is created from the config. Pass
 *        null to simulate an unconfigured server, or a stub in tests.
 * @returns {import('express').Express}
 */
function createApp(options = {}) {
  const config = options.config || defaultConfig;
  const transport =
    options.transport !== undefined
      ? options.transport
      : mailer.createTransport(config.smtp);

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);

  app.use(securityHeaders);
  app.use(cors(config));

  // Body parsers for native form posts and JSON callers. Multipart posts are
  // handled per-route by multer.
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));
  app.use(express.json({ limit: '100kb' }));

  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      emailConfigured: Boolean(transport),
    });
  });

  // API endpoints (before the static handler so they always win).
  app.use(createContactRouter({ config, transport }));

  // Static site, with secret files blocked first.
  app.use(staticGuard());
  app.use(
    express.static(config.root, {
      dotfiles: 'ignore',
      index: 'index.html',
      extensions: false,
    })
  );

  // Anything left is a 404.
  app.use((req, res) => {
    res.status(404).type('text/plain').send('Not found');
  });

  // Central error handler — never leak stack traces to the client.
  // eslint-disable-next-line no-unused-vars
  app.use((error, req, res, next) => {
    console.error('[app] unhandled error:', error);
    if (res.headersSent) return;
    res.status(500).type('text/plain').send('Something went wrong on the server.');
  });

  return app;
}

module.exports = { createApp };
