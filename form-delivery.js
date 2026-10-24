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
 * SPEED — three things keep a submission off the slow path:
 *
 *   • The API is probed once, in the background, while the visitor is still
 *     reading the page (see `warmUp`). By the time they press send the route
 *     is already decided, so a static host never pays for the doomed POST.
 *   • The connection to the mail service is opened early too, so the DNS
 *     lookup and TLS handshake are not sitting between the click and the
 *     send.
 *   • Bodies go out as `application/x-www-form-urlencoded`, which both routes
 *     accept and which the server can parse without a multipart read.
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

  // Hosts known to serve files only. On these there is no point asking the
  // API at all — the answer is always 404 — so the probe is skipped and the
  // very first submission already skips the wasted round trip. A custom
  // domain pointed at GitHub Pages is not in this list; for that case the
  // probe answers the same question a few hundred milliseconds after load.
  var STATIC_HOST_SUFFIXES = [
    '.github.io',
    '.gitlab.io',
    '.netlify.app',
    '.vercel.app',
    '.pages.dev',
    '.surge.sh',
    '.firebaseapp.com',
    '.web.app',
  ];

  // How long the background probe waits before giving up. It runs off the
  // critical path, so this only decides how long the page may stay unsure.
  var PROBE_TIMEOUT_MS = 4000;

  // A submission waits at most this long on the mail service before the
  // visitor is told rather than left watching a spinner.
  var SERVICE_TIMEOUT_MS = 15000;

  // Guard so a socket-warming request is not fired on every keystroke.
  var WARM_INTERVAL_MS = 5000;

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

  /** Is this a host that only serves files? */
  function isStaticHost(hostname) {
    if (typeof hostname !== 'string' || hostname === '') return false;

    var host = hostname.toLowerCase();
    return STATIC_HOST_SUFFIXES.some(function (suffix) {
      return host.slice(-suffix.length) === suffix;
    });
  }

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
   * Accepts the FormData the browser passes, a URLSearchParams, or an array
   * of pairs as the tests supply.
   *
   * @param {FormData | URLSearchParams | Array<[string, string]>} source
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
   * Serialise the pairs the way a plain HTML form would. The server parses
   * this with the body parser it already has, so no multipart read is needed
   * and the request carries no boundary padding.
   *
   * @param {Array<[string, string]>} entries
   * @returns {string}
   */
  function toUrlEncoded(entries) {
    return entries
      .map(function (entry) {
        return encodeURIComponent(entry[0]) + '=' + encodeURIComponent(entry[1]);
      })
      .join('&');
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
   * Add an abort signal to a request, so a silent server cannot hold the
   * visitor's browser open forever.
   *
   * @param {object} init fetch options
   * @param {number} ms timeout in milliseconds
   * @returns {{ init: object, cancel: Function }} the patched options, and a
   *          function that disarms the timer once the request settles
   */
  function guardTimeout(init, ms) {
    if (typeof AbortController !== 'function' || typeof setTimeout !== 'function') {
      return { init: init, cancel: function () {} };
    }

    var controller = new AbortController();
    var timer = setTimeout(function () {
      controller.abort();
    }, ms);

    var patched = {};
    Object.keys(init).forEach(function (key) {
      patched[key] = init[key];
    });
    patched.signal = controller.signal;

    return {
      init: patched,
      cancel: function () {
        clearTimeout(timer);
      },
    };
  }

  /**
   * POST to a URL and read the body, whatever the status.
   * A network failure rejects; an HTTP error resolves, so the caller can read
   * the server's explanation.
   *
   * @param {Function} fetchImpl
   * @param {string} url
   * @param {object} init
   * @param {number} [timeoutMs]
   * @returns {Promise<{ ok: boolean, status: number, body: string }>}
   */
  function request(fetchImpl, url, init, timeoutMs) {
    var guard = timeoutMs ? guardTimeout(init, timeoutMs) : { init: init, cancel: function () {} };

    return fetchImpl(url, guard.init).then(
      function (response) {
        guard.cancel();
        return response.text().then(function (body) {
          return { ok: response.ok, status: response.status, body: body };
        });
      },
      function (error) {
        guard.cancel();
        throw error;
      }
    );
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
   * Ask the API whether it exists, without blocking anything.
   *
   * Resolves to:
   *   'available'  the API answered — use it
   *   'missing'    nothing is serving the API here — go straight to the service
   *   'unknown'    no answer (offline, slow, unexpected status) — try the API
   *                first, as before, and let the submission decide
   *
   * @param {{ apiBase: string, fetchImpl: Function, host: string }} settings
   * @returns {Promise<'available' | 'missing' | 'unknown'>}
   */
  function probeApi(settings) {
    if (!settings.fetchImpl) return Promise.resolve('unknown');
    if (settings.apiBase === '' && isStaticHost(settings.host)) {
      return Promise.resolve('missing');
    }

    return request(settings.fetchImpl, settings.apiBase + '/health', {}, PROBE_TIMEOUT_MS)
      .then(function (result) {
        if (result.status >= 200 && result.status < 300) return 'available';
        return isFallbackWarranted(result.status) ? 'missing' : 'unknown';
      })
      .catch(function () {
        return 'unknown';
      });
  }

  /**
   * Parse the origin out of the service endpoint, so its connection can be
   * opened before the visitor needs it.
   *
   * @param {string} endpoint
   * @returns {string} origin, or '' when the endpoint is not a full URL
   */
  function serviceOrigin(endpoint) {
    var match = /^(https?:\/\/[^/]+)/i.exec(endpoint || '');
    return match ? match[1] : '';
  }

  /**
   * Send one submission, taking the fastest route that can actually deliver
   * it.
   *
   * @param {{ apiBase: string, serviceEndpoint: string, fetchImpl: Function }} settings
   * @param {string} action
   * @param {FormData | Array<[string, string]>} formData
   * @param {{ apiStatus?: string }} [route] remembered route state, updated
   *        in place as the submission teaches us what the host can do
   * @returns {Promise<{ ok: boolean, status: number, body: string }>}
   */
  function send(settings, action, formData, route) {
    var fetchImpl = settings.fetchImpl || globalFetch;
    var serviceEndpoint = (settings.serviceEndpoint || '').trim();
    var state = route || { apiStatus: 'unknown' };
    var entries = toEntries(formData);

    function throughApi() {
      return request(
        fetchImpl,
        settings.apiBase + action,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: toUrlEncoded(entries),
          keepalive: true,
        }
      ).then(
        function (result) {
          // Learn the route for the rest of the page: an "undeliverable"
          // status means there is no API here, anything else means there is.
          if (isFallbackWarranted(result.status)) state.apiStatus = 'missing';
          else state.apiStatus = 'available';
          return result;
        },
        function (error) {
          // Unreachable right now, which may be a passing network problem —
          // stay undecided so the next attempt tries the API again.
          throw error;
        }
      );
    }

    function throughService() {
      return request(
        fetchImpl,
        serviceEndpoint,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(buildServicePayload(action, entries)),
          keepalive: true,
        },
        SERVICE_TIMEOUT_MS
      ).then(readServiceResult);
    }

    if (serviceEndpoint === '') return throughApi();

    // Nothing is serving the API on this host: skip the guaranteed 404 and go
    // straight to the service. This is the difference between one round trip
    // and two on the published site.
    if (state.apiStatus === 'missing') return throughService();

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
   * Bind the page's configuration once, and hand back what the page needs:
   *
   *   send        post a submission by the fastest route that can deliver it
   *   warmUp      decide the route now (same-origin only — no third-party
   *               traffic for a visitor who never touches the form)
   *   warmService open the mail service connection, done on first interaction
   *               so the handshake happens while the visitor types
   *
   * @param {{ api?: string, service?: string, protocol?: string, host?: string, fetchImpl?: Function }} options
   * @returns {{ send: Function, warmUp: Function, warmService: Function, route: object }}
   */
  function createSender(options) {
    var settings = {
      apiBase: resolveApiBase(options.api, options.protocol),
      serviceEndpoint: options.service || '',
      fetchImpl: options.fetchImpl || globalFetch,
      host: options.host || '',
    };

    var route = { apiStatus: 'unknown' };
    var probe = null;
    var lastWarmAt = 0;

    function warmConnection() {
      // Only the browser can open a socket for later reuse, so this does
      // nothing under Node or when no service endpoint is configured.
      var origin = serviceOrigin(settings.serviceEndpoint);
      if (origin === '' || !settings.fetchImpl) return;
      if (typeof window === 'undefined') return;

      var now = Date.now();
      if (now - lastWarmAt < WARM_INTERVAL_MS) return;
      lastWarmAt = now;

      try {
        // The reply is irrelevant and unreadable on purpose: the point is the
        // DNS lookup, the TCP connection and the TLS handshake, all done
        // before the visitor presses send.
        var warming = settings.fetchImpl(origin + '/', {
          method: 'HEAD',
          mode: 'no-cors',
          cache: 'no-store',
        });
        if (warming && typeof warming.catch === 'function') {
          warming.catch(function () {});
        }
      } catch (_error) {
        // A failed warm-up costs nothing; the real request still goes out.
      }
    }

    function warmUp() {
      if (!probe) {
        probe = probeApi(settings).then(function (status) {
          route.apiStatus = status;
          return status;
        });
      }
      return probe;
    }

    return {
      send: function (action, formData) {
        return send(settings, action, formData, route);
      },
      warmUp: warmUp,
      warmService: warmConnection,
      route: route,
    };
  }

  return {
    UNDELIVERABLE_STATUSES: UNDELIVERABLE_STATUSES,
    resolveApiBase: resolveApiBase,
    isStaticHost: isStaticHost,
    toEntries: toEntries,
    toUrlEncoded: toUrlEncoded,
    buildServicePayload: buildServicePayload,
    isFallbackWarranted: isFallbackWarranted,
    serviceOrigin: serviceOrigin,
    probeApi: probeApi,
    send: send,
    createSender: createSender,
  };
});
