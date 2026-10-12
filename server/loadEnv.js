'use strict';

/* loadEnv — a tiny, dependency-free .env reader.
 *
 * The portfolio backend keeps its secrets (SMTP credentials) in a local .env
 * file that is never committed. This module parses that file and copies each
 * key into process.env without overwriting anything already set, so real
 * environment variables always win over the file.
 */

const fs = require('fs');

/**
 * Parse the contents of a .env file into a plain object.
 * Supports `KEY=value`, `KEY="value"`, `KEY='value'`, blank lines and `#` comments.
 *
 * @param {string} contents raw file contents
 * @returns {Record<string, string>} parsed key/value pairs
 */
function parseEnv(contents) {
  const result = {};
  const lines = String(contents).split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;

    const separator = trimmed.indexOf('=');
    if (separator === -1) continue;

    const key = trimmed.slice(0, separator).trim();
    if (key === '') continue;

    let value = trimmed.slice(separator + 1).trim();
    const isQuoted =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"));
    if (isQuoted && value.length >= 2) {
      value = value.slice(1, -1);
    }

    result[key] = value;
  }

  return result;
}

/**
 * Load a .env file (if it exists) into process.env.
 * Missing files are not an error: the app can run purely from real env vars.
 *
 * @param {string} filePath absolute path to the .env file
 * @returns {Record<string, string>} the values read from the file
 */
function loadEnv(filePath) {
  let contents;
  try {
    contents = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }

  const parsed = parseEnv(contents);
  for (const key of Object.keys(parsed)) {
    if (process.env[key] === undefined) {
      process.env[key] = parsed[key];
    }
  }

  return parsed;
}

module.exports = { parseEnv, loadEnv };
