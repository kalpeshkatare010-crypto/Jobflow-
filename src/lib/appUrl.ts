/**
 * Absolute link to a page of this app, for sharing (e.g. invitation links).
 * The preview build uses hash routing, so its links need "#".
 */
export function appUrl(path: string, origin: string = window.location.origin, hashRouting = import.meta.env.MODE === 'preview'): string {
  const clean = path.startsWith('/') ? path : `/${path}`;
  if (hashRouting) {
    const base = `${origin}${window.location.pathname}`.replace(/\/?$/, '/');
    return `${base}#${clean}`;
  }
  return `${origin}${clean}`;
}
