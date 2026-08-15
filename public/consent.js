/**
 * Cookie consent, and the Google Analytics loader behind it.
 *
 * GA4 sets cookies and assigns a pseudonymous identifier, which in the EU and
 * UK generally needs consent *before* it runs — not a banner shown while it is
 * already running. So the gtag scripts are not in the HTML at all. They are
 * injected here, and only after someone has actively said yes.
 *
 * Cloudflare Web Analytics is left alone deliberately: it is cookieless, sets
 * no identifier and does not track across sites, so it is not what a consent
 * banner is for.
 *
 * The choice is stored in localStorage rather than in a cookie. Storing a
 * "no thanks" in a cookie in order to remember that someone declined cookies
 * is the kind of joke this site should not be making.
 *
 * External same-origin file rather than an inline block, so the CSP needs
 * `script-src 'self'` and no hash that must be regenerated on every edit.
 */
(function () {
  'use strict';

  var KEY = 'nw-consent';
  var GA_ID = 'G-LXNWBS7347';

  function read() {
    try {
      return localStorage.getItem(KEY);
    } catch (e) {
      // Private mode, or storage disabled. Treat as "no decision" and, since
      // we cannot remember a yes, never load analytics.
      return null;
    }
  }

  function write(value) {
    try {
      localStorage.setItem(KEY, value);
    } catch (e) {
      /* Nothing to do — the banner simply reappears next visit. */
    }
  }

  function loadAnalytics() {
    if (window.__nwAnalyticsLoaded) return;
    window.__nwAnalyticsLoaded = true;

    var tag = document.createElement('script');
    tag.async = true;
    tag.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
    document.head.appendChild(tag);

    window.dataLayer = window.dataLayer || [];
    window.gtag = function () {
      window.dataLayer.push(arguments);
    };
    window.gtag('js', new Date());
    window.gtag('config', GA_ID);
  }

  function hide(banner) {
    banner.hidden = true;
  }

  /**
   * Delete any Google Analytics cookies already on this domain.
   *
   * Matters for someone who allowed analytics before and has now changed their
   * mind: saying "Google Analytics does not run" while their `_ga` identifier
   * sits in the jar would be technically true and practically dishonest. They
   * are first-party cookies, so we can actually remove them.
   *
   * Expiring a cookie requires the same path and domain it was set with, and
   * GA uses the registrable domain — hence the walk up the host.
   */
  function clearAnalyticsCookies() {
    var names = document.cookie.split(';').map(function (pair) {
      return pair.split('=')[0].trim();
    });
    var hosts = [null, location.hostname, '.' + location.hostname];
    var parts = location.hostname.split('.');
    if (parts.length > 2) hosts.push('.' + parts.slice(-2).join('.'));

    names.forEach(function (name) {
      if (name.indexOf('_ga') !== 0) return;
      hosts.forEach(function (host) {
        document.cookie =
          name +
          '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/' +
          (host ? '; domain=' + host : '');
      });
    });
  }

  /**
   * Let the privacy page offer a real way to change your mind. Without this,
   * "you can withdraw consent" would be a claim with no mechanism behind it.
   */
  window.nwResetConsent = function () {
    try {
      localStorage.removeItem(KEY);
    } catch (e) {
      /* ignore */
    }
    location.reload();
  };

  function init() {
    /*
     * The privacy page's "change my choice" button. Wired here rather than with
     * an inline onclick, which the CSP blocks — and blocks silently, so the
     * button would look fine and do nothing.
     */
    var reset = document.getElementById('nw-consent-reset');
    if (reset) {
      reset.addEventListener('click', function () {
        window.nwResetConsent();
      });
    }

    var banner = document.getElementById('nw-consent');
    var choice = read();

    if (choice === 'granted') {
      loadAnalytics();
      if (banner) hide(banner);
      return;
    }
    if (choice === 'denied') {
      // Also sweep up anything set before they changed their mind.
      clearAnalyticsCookies();
      if (banner) hide(banner);
      return;
    }

    // No decision yet: nothing has loaded, and nothing will until it is made.
    if (!banner) return;
    banner.hidden = false;

    var accept = document.getElementById('nw-consent-accept');
    var decline = document.getElementById('nw-consent-decline');

    if (accept) {
      accept.addEventListener('click', function () {
        write('granted');
        loadAnalytics();
        hide(banner);
      });
    }
    if (decline) {
      decline.addEventListener('click', function () {
        write('denied');
        clearAnalyticsCookies();
        hide(banner);
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
