// Google Analytics 4 bootstrap.
//
// Kept in an external same-origin file rather than an inline <script> so the
// Content-Security-Policy only has to allow 'self' for it. An inline block
// would need a hash regenerated on every edit, which is exactly the kind of
// silent-breakage we already hit once with the Cloudflare beacon.
//
// The measurement ID is public by design; it is not a secret.
window.dataLayer = window.dataLayer || [];
function gtag() {
  dataLayer.push(arguments);
}
gtag('js', new Date());
gtag('config', 'G-LXNWBS7347');
