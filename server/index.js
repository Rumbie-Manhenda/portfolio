'use strict';

/* index — the entry point. Loads settings, creates the mail transport, starts
 * the HTTP server and reports clearly whether email is ready to send.
 *
 * Run with:  node server/index.js   (or:  npm start)
 */

const { createApp } = require('./app');
const config = require('./config');
const mailer = require('./mailer');

const transport = mailer.createTransport(config.smtp);
const app = createApp({ config, transport });

const server = app.listen(config.port, () => {
  console.log(`Portfolio server running at http://localhost:${config.port}`);

  if (transport) {
    console.log(`Email ready — contact messages will be delivered to ${config.mailTo}.`);
  } else {
    console.warn(
      'Email is NOT configured yet, so the contact forms will report an error.\n' +
        'Create portfolio/.env from .env.example and fill in the SMTP_* values ' +
        '(see the readme for the Gmail app-password steps), then restart.'
    );
  }
});

function shutdown(signal) {
  console.log(`\nReceived ${signal}, shutting down.`);
  server.close(() => process.exit(0));
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
