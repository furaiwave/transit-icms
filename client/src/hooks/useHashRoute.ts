import { useEffect, useState } from 'react';

export const ROUTES = ['console', 'results'] as const;
export type Route = (typeof ROUTES)[number];

const isRoute = (x: string): x is Route => (ROUTES as readonly string[]).includes(x);

const parse = (): Route => {
  const raw = window.location.hash.replace(/^#\/?/, '');
  return isRoute(raw) ? raw : 'console';
};

/**
 * Мінімальна маршрутизація на hash: двох екранів замало, щоб тягнути
 * повноцінний роутер. Працює і в dev-сервері, і на статиці без
 * серверних правил перезапису.
 */
export const useHashRoute = (): readonly [Route, (r: Route) => void] => {
  const [route, setRoute] = useState<Route>(parse);

  useEffect(() => {
    const onChange = (): void => setRoute(parse());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  const navigate = (r: Route): void => {
    window.location.hash = `#/${r}`;
  };

  return [route, navigate] as const;
};
