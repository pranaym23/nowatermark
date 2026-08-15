/**
 * Cloudflare Turnstile loader.
 *
 * Turnstile is what stops the rewrite proxy from spending our Gemini key on
 * whoever finds it. The server refuses to run without its secret; this is the
 * client half that produces the token.
 *
 * The site key is public by design — it identifies the widget, it does not
 * authorise anything. The *secret* key never leaves the Pages environment.
 */

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

interface TurnstileApi {
  render: (
    el: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      'error-callback'?: () => void;
      'expired-callback'?: () => void;
      theme?: 'auto' | 'light' | 'dark';
      appearance?: 'always' | 'execute' | 'interaction-only';
    },
  ) => string;
  remove: (widgetId: string) => void;
  reset: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

/**
 * Build-time public config. When this is absent the rewrite feature does not
 * render at all, which keeps the deployed site in exactly the state it was in
 * before the feature existed.
 */
export const TURNSTILE_SITE_KEY: string =
  (import.meta.env.PUBLIC_TURNSTILE_SITE_KEY as string | undefined) ?? '';

export const REWRITE_ENABLED = TURNSTILE_SITE_KEY.length > 0;

let loading: Promise<TurnstileApi | null> | null = null;

export function loadTurnstile(): Promise<TurnstileApi | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (loading) return loading;

  loading = new Promise<TurnstileApi | null>((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    const script = existing ?? document.createElement('script');

    const settle = () => resolve(window.turnstile ?? null);
    script.addEventListener('load', settle);
    script.addEventListener('error', () => resolve(null));

    if (!existing) {
      script.src = SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
  });

  return loading;
}
