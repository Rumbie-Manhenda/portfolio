'use strict';

/* mailer — turns a validated form submission into an email and hands it to
 * nodemailer. Bodies are plain text only, so nothing a visitor types can
 * inject markup into the message.
 */

const nodemailer = require('nodemailer');

// How many SMTP connections to keep open, and how many messages to put
// through each before recycling it. Providers cap messages per connection
// (Gmail closes one after ~100), so staying well below that keeps a healthy
// socket in the pool instead of surprising us mid-send.
const POOL_MAX_CONNECTIONS = 3;
const POOL_MAX_MESSAGES = 50;

/**
 * Build a nodemailer transport from SMTP settings, or null when they are
 * incomplete so the caller can report a clear "not configured" state.
 *
 * Pooling matters for speed: without it every email pays for a fresh TCP
 * connection, a TLS handshake and an AUTH exchange — on a hosted provider
 * that is most of the delay between the visitor pressing send and the mail
 * being accepted. With a pool those costs are paid once and then reused.
 *
 * @param {{ host: string, port: number, secure: boolean, user: string, pass: string }} smtp
 * @returns {import('nodemailer').Transporter | null}
 */
function createTransport(smtp) {
  if (!smtp || !smtp.host || !smtp.user || !smtp.pass) return null;

  return nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure, // true for 465, false for 587/STARTTLS
    auth: { user: smtp.user, pass: smtp.pass },
    pool: true,
    maxConnections: POOL_MAX_CONNECTIONS,
    maxMessages: POOL_MAX_MESSAGES,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
  });
}

/**
 * Compose the notification email for the contact form.
 *
 * @param {{ mailFrom: string, mailTo: string }} config
 * @param {{ email: string, message: string }} values
 */
function contactMessage(config, { email, message }) {
  return {
    from: config.mailFrom,
    to: config.mailTo,
    replyTo: email,
    subject: `Portfolio message from ${email}`,
    text: [
      'New message from the contact form on your portfolio.',
      '',
      `Reply to: ${email}`,
      '',
      '----------------------------------------',
      message,
      '----------------------------------------',
      '',
      'Sent automatically from the portfolio website.',
    ].join('\n'),
  };
}

/**
 * Compose the notification email for the recommendation form.
 *
 * @param {{ mailFrom: string, mailTo: string }} config
 * @param {{ name: string, email: string, message: string }} values
 */
function recommendationMessage(config, { name, email, message }) {
  return {
    from: config.mailFrom,
    to: config.mailTo,
    replyTo: email,
    subject: `Portfolio recommendation from ${name}`,
    text: [
      'A new recommendation was submitted on your portfolio.',
      '',
      `Name:  ${name}`,
      `Email: ${email}`,
      '',
      '----------------------------------------',
      message,
      '----------------------------------------',
      '',
      'Sent automatically from the portfolio website.',
    ].join('\n'),
  };
}

/**
 * Send a composed message and return nodemailer's info object.
 *
 * @param {import('nodemailer').Transporter} transport
 * @param {object} message
 */
function send(transport, message) {
  return transport.sendMail(message);
}

/**
 * When a test transport (Ethereal) is in use, nodemailer exposes a preview URL.
 * Returns null for ordinary SMTP sends.
 *
 * @param {object} info
 * @returns {string | null}
 */
function previewUrl(info) {
  try {
    return nodemailer.getTestMessageUrl(info) || null;
  } catch (_error) {
    return null;
  }
}

module.exports = {
  createTransport,
  contactMessage,
  recommendationMessage,
  send,
  previewUrl,
};
