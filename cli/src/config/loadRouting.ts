import { parse as parseYaml } from 'yaml';
import type { FetchMethod } from '../types/capture.js';

export type StrategyName = FetchMethod;

export type ApifyRouteConfig = {
  actorId: string;
  build?: string;
  inputFromUrl?: boolean;
  /**
   * YouTube-only: Apify actors differ on input shape.
   * - `start_urls` — `{ startUrls: [{ url }] }` (website-style crawlers)
   * - `urls` — `{ urls: [url] }` (e.g. `automation-lab/youtube-transcript` on Apify Store)
   */
  youtubeInput?: 'start_urls' | 'urls';
};

export type RouteMatch = {
  hostSuffix?: string;
  pathPrefix?: string;
};

export type RoutingRoute = {
  match: RouteMatch;
  strategy: StrategyName;
  apify?: ApifyRouteConfig;
};

export type RoutingConfig = {
  version: number;
  defaultStrategy: StrategyName;
  routes: RoutingRoute[];
  apifyDefaults?: ApifyRouteConfig;
};

export function loadRouting(yamlText: string): RoutingConfig {
  const raw = parseYaml(yamlText) as RoutingConfig;
  if (raw?.version !== 1) throw new Error('routing: expected version: 1');
  if (!raw.defaultStrategy) throw new Error('routing: missing defaultStrategy');
  if (!Array.isArray(raw.routes)) throw new Error('routing: routes must be an array');
  return raw;
}

function hostMatches(hostname: string, suffix: string): boolean {
  if (suffix === '*') return true;
  return hostname === suffix || hostname.endsWith(`.${suffix}`);
}

function pathMatches(pathname: string, prefix: string | undefined): boolean {
  if (prefix === undefined || prefix === '') return true;
  return pathname === prefix || pathname.startsWith(prefix.endsWith('/') ? prefix : `${prefix}/`) || pathname.startsWith(prefix);
}

/** First matching route wins; otherwise defaultStrategy with optional apifyDefaults for apify strategy. */
export function resolveStrategy(
  config: RoutingConfig,
  urlString: string,
): { strategy: StrategyName; apify?: ApifyRouteConfig } {
  let u: URL;
  try {
    u = new URL(urlString);
  } catch {
    throw new Error(`resolveStrategy: invalid URL: ${urlString}`);
  }
  const hostname = u.hostname.toLowerCase();
  const pathname = u.pathname || '/';

  for (const route of config.routes) {
    const suf = route.match.hostSuffix;
    if (suf !== undefined && !hostMatches(hostname, suf.toLowerCase())) continue;
    if (!pathMatches(pathname, route.match.pathPrefix)) continue;
    let apify: ApifyRouteConfig | undefined;
    if (route.strategy === 'apify') {
      const merged = { ...config.apifyDefaults, ...route.apify };
      if (!merged.actorId) throw new Error('routing: apify route missing actorId and apifyDefaults.actorId');
      apify = merged as ApifyRouteConfig;
    }
    return { strategy: route.strategy, apify };
  }

  const strategy = config.defaultStrategy;
  if (strategy === 'apify') {
    const merged = { ...config.apifyDefaults };
    if (!merged.actorId) throw new Error('routing: default apify strategy requires apifyDefaults.actorId');
    return { strategy, apify: merged as ApifyRouteConfig };
  }
  return { strategy };
}
