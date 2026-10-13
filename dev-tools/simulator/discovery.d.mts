export interface DiscoveredApp {
  url: string; name: string; iconUrl: string; manifestUrl: string | null;
  manifest: Record<string, unknown> | null; lexicons: Record<string, unknown>[]; warnings: string[];
}
export function discoverApp(value: string, options?: {
  fetcher?: (url: URL, options: { signal: AbortSignal }) => Promise<Response>; timeout?: number;
}): Promise<DiscoveredApp>;
