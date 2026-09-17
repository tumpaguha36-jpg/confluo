export function track(event, props = {}) {
  if (typeof window === 'undefined') return;
  // No vendor configured: log in dev, no-op in prod.
  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.log('[analytics]', event, props);
  }
}
