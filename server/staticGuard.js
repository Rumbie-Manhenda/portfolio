'use strict';

/* staticGuard — blocks requests for files that should never be served from
 * the web root. The site folder also holds things like SSH keys, the
 * package manifest and server source; none of that belongs on the internet.
 */

// Directories whose contents must never be exposed.
const BLOCKED_PREFIXES = ['/server', '/test', '/node_modules', '/__pycache__'];

// Exact files that must never be exposed.
const BLOCKED_FILES = [
  '/gitkey',
  '/gitkey.pub',
  '/package.json',
  '/package-lock.json',
  '/requirements.txt',
  '/.gitignore',
  '/readme.md',
];

/**
 * Express middleware: reject anything that reaches a blocked path with a 404.
 *
 * @returns {import('express').RequestHandler}
 */
function staticGuard() {
  const blockedFiles = new Set(BLOCKED_FILES.map((entry) => entry.toLowerCase()));

  return function guard(req, res, next) {
    const path = decodeURIComponent(req.path).toLowerCase();

    const inBlockedDir = BLOCKED_PREFIXES.some(
      (prefix) => path === prefix || path.startsWith(`${prefix}/`)
    );
    if (inBlockedDir) {
      return res.status(404).type('text/plain').send('Not found');
    }

    if (blockedFiles.has(path) || path.endsWith('/.env') || path === '/.env') {
      return res.status(404).type('text/plain').send('Not found');
    }

    return next();
  };
}

module.exports = { staticGuard };
