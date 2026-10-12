'use strict';

/* contact routes — the two endpoints the frontend posts to:
 *   POST /submit      (contact form:  email, message)
 *   POST /submit_rec  (recommendation: name_rec, email_rec, message_rec)
 *
 * Both accept multipart/form-data (what the browser's fetch+FormData sends)
 * and application/x-www-form-urlencoded (a plain no-JavaScript form post).
 */

const express = require('express');
const multer = require('multer');

const { rateLimit } = require('../rateLimit');
const {
  validateContact,
  validateRecommendation,
} = require('../validate');
const mailer = require('../mailer');

const RATE_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const RATE_MAX = 10; // submissions per address per window
const FIELD_LIMIT_BYTES = 20000;

function notConfigured(config, res) {
  return res
    .status(503)
    .type('text/plain')
    .send(
      'This form is not connected to an email account yet. ' +
        `Please email me directly at ${config.mailTo} in the meantime.`
    );
}

function sendFailure(config, res, error) {
  console.error('[contact] failed to send email:', error.message);
  return res
    .status(502)
    .type('text/plain')
    .send(
      'Sorry — your message could not be sent right now. ' +
        `Please email me directly at ${config.mailTo}.`
    );
}

function successText(prefix, email) {
  return `${prefix} I will reply to ${email} as soon as I can.`;
}

/**
 * Build the router. The transport is injected so tests can supply a stub.
 *
 * @param {{ config: object, transport: import('nodemailer').Transporter | null }} deps
 */
function createContactRouter({ config, transport }) {
  const router = express.Router();
  const upload = multer({
    limits: { fieldSize: FIELD_LIMIT_BYTES, fields: 20, files: 0 },
  });
  const limiter = rateLimit({
    windowMs: RATE_WINDOW_MS,
    max: RATE_MAX,
    disabled: config.rateLimitDisabled,
  });

  router.post('/submit', limiter, upload.none(), async (req, res) => {
    if (!transport) return notConfigured(config, res);

    const result = validateContact(req.body);
    if (!result.ok) {
      return res.status(400).type('text/plain').send(result.errors[0]);
    }

    try {
      const info = await mailer.send(
        transport,
        mailer.contactMessage(config, result.value)
      );
      const preview = mailer.previewUrl(info);
      if (preview) console.log('[contact] contact message preview:', preview);

      return res
        .type('text/plain')
        .send(successText('Thank you — your message is on its way to me.', result.value.email));
    } catch (error) {
      return sendFailure(config, res, error);
    }
  });

  router.post('/submit_rec', limiter, upload.none(), async (req, res) => {
    if (!transport) return notConfigured(config, res);

    const result = validateRecommendation(req.body);
    if (!result.ok) {
      return res.status(400).type('text/plain').send(result.errors[0]);
    }

    try {
      const info = await mailer.send(
        transport,
        mailer.recommendationMessage(config, result.value)
      );
      const preview = mailer.previewUrl(info);
      if (preview) console.log('[contact] recommendation preview:', preview);

      return res
        .type('text/plain')
        .send(
          successText('Thank you for the recommendation — it means a lot.', result.value.email)
        );
    } catch (error) {
      return sendFailure(config, res, error);
    }
  });

  return router;
}

module.exports = { createContactRouter };
