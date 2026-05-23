/**
 * @fileoverview Server-specific environment variable configuration.
 * @module config/server-config
 */

import { z } from '@cyanheads/mcp-ts-core';
import { parseEnvConfig } from '@cyanheads/mcp-ts-core/config';

const ServerConfigSchema = z.object({
  nominatimBaseUrl: z
    .string()
    .url()
    .default('https://nominatim.openstreetmap.org')
    .describe('Nominatim API base URL. Override to use a private or mirror instance.'),
  overpassBaseUrl: z
    .string()
    .url()
    .default('https://overpass-api.de/api/interpreter')
    .describe('Overpass API endpoint URL. Override to use a mirror or private instance.'),
  nominatimUserAgent: z
    .string()
    .default('nominatim-mcp-server/0.1.0')
    .describe('User-Agent sent to Nominatim. Required by usage policy.'),
});

export type ServerConfig = z.infer<typeof ServerConfigSchema>;

let _config: ServerConfig | undefined;

export function getServerConfig(): ServerConfig {
  _config ??= parseEnvConfig(ServerConfigSchema, {
    nominatimBaseUrl: 'NOMINATIM_BASE_URL',
    overpassBaseUrl: 'OVERPASS_BASE_URL',
    nominatimUserAgent: 'NOMINATIM_USER_AGENT',
  });
  return _config;
}
