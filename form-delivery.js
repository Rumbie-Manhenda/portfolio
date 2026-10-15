/* form-delivery.js — decides where a contact-form submission actually goes,
 * and sends it.
 *
 * There are two possible destinations:
 *
 *   1. The Express API in `server/` (POST /submit, POST /submit_rec). This is
 *      the preferred route: it validates the input, rate-limits it, and sends
 *      the mail through the site owner's own SMTP account.
 *
 *   2. A form-to-email service (FormSubmit), configured in api-config.js.
 *      GitHub Pages can only serve files — it cannot run the Express API — so
 *      on the published site the first route is a guaranteed 404. When the API
 *      is missing or cannot send, the submission is re-sent to the service,
 *      which emails it straight to the address in the endpoint.
 *
 * The fallback only triggers when the API is genuinely unavailable. A 400
 * (bad input) or 429 (too many requests) is a real answer about the
 * submission, and is handed straight back to the visitor.
 *
 * Loaded as a classic script so it works from file:// as well as a server,
 * and exported for the Node test suite.
 */

(function (root, factory) {
  'use strict';

  var api = factory();

  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PortfolioDelivery = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  // Statuses that mean "this route cannot deliver the message", as opposed to
  // a real answer about the submission itself.
  //   404  no API at this host (a static host such as GitHub Pages)
  //   405  the host refuses POST on this path
  //   502  the API reached its mail server and the send failed
  //   503  the API has no mail account configured
  var UNDELIVERABLE_STATUSES = [404, 405, 502, 503];

  // The API names the recommendation fields with a _rec suffix so they cannot
  // collide with the contact form's fields. The mail service has no such
  // constraint, so they are renamed back before sending.
  var FIELD_ALIASES = {
    name_rec: 'name',
    email_rec: 'email',
    message_rec: 'message',
  };

  /** The global fetch, or null where the environment has none. */
  var globalFetch = typeof fetch === 'function' ? fetch : null;

  /**
   * Work out which host the API lives on.
   *
   * An explicitly configured URL wins. Failing that, the site's own origin is
   * correct whenever the Express server is serving the pages too — which is
   * how `npm start` runs it and how a single-host deploy runs it. A page
   * opened straight from disk has no origin to post to, so it falls back to
   * the local development server.
   *
   * @param {string} configured value of window.PORTFOLIO_API
   * @param {string} protocol   window.location.protocol
   * @returns {string} base URL, without a trailing slash
   */
  function resolveApiBase(configured, protocol) {
    var value = typeof configured === 'string' ? configured.trim() : '';
    if (value !== '') return value.replace(/\/+$/, '');
    return protocol === 'file:' ? 'http://localhost:3000' : '';
  }

  /**
   * Normalise a form's contents into `[key, value]` pairs.
   * Accepts the FormData the browser passes, or an array of pairs as the
   * tests supply.
   *
   * @param {FormData | Array<[string, string]>} source
   * @returns {Array<[string, string]>}
   */
  function toEntries(source) {
    if (!source) return [];
    if (Array.isArray(source)) return source;

    var entries = [];
    source.forEach(function (value, key) {
      entries.push([key, value]);
    });
    return entries;
  }

  /**
   * Build the JSON body the form service expects.
   *
   * @param {string} action one of '/submit', '/submit_rec'
   * @param {Array<[string, string]>} entries
   * @returns {object}
   */
  function buildServicePayload(action, entries) {
    var payload = { _template: 'table', _captcha: 'false' };

    entries.forEach(function (entry) {
      var name = FIELD_ALIASES[entry[0]] || entry[0];
      payload[name] = entry[1];
    });

    if (action === '/submit_rec') {
      payload._subject =
        'Portfolio recommendation from ' + (payload.name || 'a visitor');
    } else {
      payload._subject =
        'Portfolio message from ' + (payload.email || 'a visitor');
    }

    // The service uses this as Reply-To, so replying reaches the visitor.
    if (payload.email) payload._replyto = payload.email;

    return payload;
  }

  /**
   * Should this API response send the submission to the fallback route?
   *
   * @param {number} status HTTP status the API answered with
   * @returns {boolean}
   */
  function isFallbackWarranted(status) {
    return UNDELIVERABLE_STATUSES.indexOf(status) !== -1;
  }

  /**
   * POST to a URL and read the body, whatever the status.
   * A network failure rejects; an HTTP error resolves, so the caller can read
   * the server's explanation.
   *
   * @returns {Promise<{ ok: boolean, status: number, body: string }>}
   */
  function request(fetchImpl, url, init) {
    return fetchImpl(url, init).then(function (response) {
      return response.text().then(function (body) {
        return { ok: response.ok, status: response.status, body: body };
      });
    });
  }

  /**
   * Turn the form service's reply into the same shape `request` produces, so
   * the caller has one result type to deal with. The service answers 200 even
   * when it has refused the message, so the body has to be read.
   */
  function readServiceResult(result) {
    if (!result.ok) return result;

    var parsed;
    try {
      parsed = JSON.parse(result.body);
    } catch (_error) {
      return {
        ok: false,
        status: result.status,
        body: 'The message service returned an unexpected reply.',
      };
    }

    if (String(parsed.success) === 'true') {
      // The visitor is shown the site's own wording, from main.js, rather than
      // the service's. An empty body means "use the default sentence".
      return { ok: true, status: result.status, body: '' };
    }

    console.error(
      '[forms] the message service refused the submission:',
      parsed.message || '(no reason given)'
    );

    return {
      ok: false,
      status: result.status,
      body: 'Sorry — your message could not be sent right now. Please email me directly.',
    };
  }

  /**
   * Send one submission, falling back to the form service when the API cannot
   * deliver it.
   *
   * @param {{ apiBase: string, serviceEndpoint: string, fetchImpl: Function }} settings
   * @param {string} action
   * @param {FormData | Array<[string, string]>} formData
   * @returns {Promise<{ ok: boolean, status: number, body: string }>}
   */
  function send(settings, action, formData) {
    var fetchImpl = settings.fetchImpl || globalFetch;
    var serviceEndpoint = (settings.serviceEndpoint || '').trim();

    function throughApi() {
      return request(fetchImpl, settings.apiBase + action, {
        method: 'POST',
        body: formData,
      });
    }

    function throughService() {
      return request(fetchImpl, serviceEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(buildServicePayload(action, toEntries(formData))),
      }).then(readServiceResult);
    }

    if (serviceEndpoint === '') return throughApi();

    return throughApi().then(
      function (result) {
        return isFallbackWarranted(result.status) ? throughService() : result;
      },
      function () {
        // The API could not be reached at all — offline, wrong host, or a
        // static host with nothing listening.
        return throughService();
      }
    );
  }

  /**
   * Bind the page's configuration once, and hand back a `send` for any action.
   *
   * @param {{ api?: string, service?: string, protocol?: string, fetchImpl?: Function }} options
   * @returns {(action: string, formData: FormData) => Promise<object>}
   */
  function createSender(options) {
    var settings = {
      apiBase: resolveApiBase(options.api, options.protocol),
      serviceEndpoint: options.service || '',
      fetchImpl: options.fetchImpl || globalFetch,
    };

    return function (action, formData) {
      return send(settings, action, formData);
    };
  }

  return {
    UNDELIVERABLE_STATUSES: UNDELIVERABLE_STATUSES,
    resolveApiBase: resolveApiBase,
    toEntries: toEntries,
    buildServicePayload: buildServicePayload,
    isFallbackWarranted: isFallbackWarranted,
    send: send,
    createSender: createSender,
  };
});
