/* api-config.js — where the contact forms send their messages.
 *
 * Loaded before form-delivery.js and main.js, so this runs first.
 *
 * There are two delivery routes, and the page uses them in order:
 *
 *   1. The Express API in `server/` — validated, rate-limited, sent through
 *      your own SMTP account. Used whenever it answers.
 *
 *   2. The form service below — used only when the API cannot deliver, which
 *      is what happens on a static host such as GitHub Pages: it serves files
 *      and nothing else, so /submit is a 404 there.
 *
 * That means the form works both on your own machine (route 1) and on the
 * published site (route 2), with no switching over.
 *
 * ---------------------------------------------------------------------------
 * ROUTE 1 — YOUR OWN SERVER
 *
 * LEAVE IT EMPTY when the Express server in `server/` is serving this site as
 * well as the API. That is how `npm start` runs it, and how a single-host
 * deploy runs it — the forms then post to the page's own origin:
 *
 *     window.PORTFOLIO_API = '';
 *
 * SET IT to the API's full URL when the pages and the API are hosted
 * separately — the pages on GitHub Pages, the API on Render, for example:
 *
 *     window.PORTFOLIO_API = 'https://patricia-portfolio-api.onrender.com';
 *
 * No trailing slash; the form paths (/submit and /submit_rec) are appended to
 * whatever is set here. The server must also allow this site's origin: set
 * ALLOWED_ORIGINS to the site's address, or to * while you are testing.
 *
 * ---------------------------------------------------------------------------
 * ROUTE 2 — THE FORM SERVICE (for static hosting)
 *
 * GitHub Pages cannot run the Express API, so the published site needs a route
 * that does not require a server. FormSubmit takes the submission straight
 * from the browser and emails it to the address in the URL.
 *
 * LEAVE IT EMPTY to switch the fallback off and use the API only.
 *
 * ONE-TIME SETUP: the first submission triggers a confirmation email to that
 * address. Click the link in it once, and every message from then on is
 * delivered. Until it is confirmed, nothing arrives.
 *
 * The address is visible in this file, and in the page source — but it is
 * already published in the mailto: links in the footer and on the cover
 * letter, so this exposes nothing new. To use a different address, change the
 * one after /ajax/.
 */

window.PORTFOLIO_API = '';

window.PORTFOLIO_FORM_ENDPOINT = 'https://formsubmit.co/ajax/pattymcharis15@gmail.com';
