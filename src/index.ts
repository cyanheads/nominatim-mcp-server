#!/usr/bin/env node
/**
 * @fileoverview nominatim-mcp-server MCP server entry point.
 * @module index
 */

import { createApp } from '@cyanheads/mcp-ts-core';
import { nominatimGeocode } from './mcp-server/tools/definitions/nominatim-geocode.tool.js';
import { nominatimLookup } from './mcp-server/tools/definitions/nominatim-lookup.tool.js';
import { nominatimReverse } from './mcp-server/tools/definitions/nominatim-reverse.tool.js';
import { overpassQueryBbox } from './mcp-server/tools/definitions/overpass-query-bbox.tool.js';
import { overpassQueryNearby } from './mcp-server/tools/definitions/overpass-query-nearby.tool.js';
import { overpassQueryRaw } from './mcp-server/tools/definitions/overpass-query-raw.tool.js';
import { initNominatimService } from './services/nominatim/nominatim-service.js';
import { initOverpassService } from './services/overpass/overpass-service.js';

await createApp({
  tools: [
    nominatimGeocode,
    nominatimReverse,
    nominatimLookup,
    overpassQueryNearby,
    overpassQueryBbox,
    overpassQueryRaw,
  ],
  resources: [],
  prompts: [],
  instructions:
    'OpenStreetMap geocoding and spatial query server. ' +
    'Use nominatim_geocode to resolve place names or addresses to coordinates. ' +
    'Use nominatim_reverse to convert coordinates to an address. ' +
    'Use nominatim_lookup to fetch details for known OSM IDs. ' +
    'Use overpass_query_nearby for "what\'s near X?" queries. ' +
    'Use overpass_query_bbox for area surveys. ' +
    'Use overpass_query_raw for advanced Overpass QL. ' +
    'All data © OpenStreetMap contributors, ODbL 1.0. ' +
    'Override endpoints via NOMINATIM_BASE_URL or OVERPASS_BASE_URL for private instances.',
  setup(core) {
    initNominatimService(core.config, core.storage);
    initOverpassService(core.config, core.storage);
  },
});
