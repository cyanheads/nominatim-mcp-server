/**
 * @fileoverview Reverse geocoding tool — converts coordinates to nearest address or place.
 * @module mcp-server/tools/definitions/nominatim-reverse.tool
 */

import { tool, z } from '@cyanheads/mcp-ts-core';
import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { getNominatimService } from '@/services/nominatim/nominatim-service.js';

const ATTRIBUTION = 'Data © OpenStreetMap contributors, ODbL 1.0';

export const nominatimReverse = tool('nominatim_reverse', {
  title: 'Reverse geocode coordinates to an address',
  description:
    'Convert latitude/longitude coordinates to the nearest address or place name via Nominatim/OpenStreetMap. ' +
    'Returns the closest matching OSM object at the given coordinates. ' +
    'Note: Nominatim finds the nearest indexed OSM object — in dense areas this may differ from the address at the exact coordinate. ' +
    'Use zoom=18 for building-level accuracy, lower zoom values for coarser resolution (e.g., zoom=10 for city-level).',
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },

  input: z.object({
    lat: z.number().min(-90).max(90).describe('Latitude in WGS84 decimal degrees.'),
    lon: z.number().min(-180).max(180).describe('Longitude in WGS84 decimal degrees.'),
    zoom: z
      .number()
      .int()
      .min(3)
      .max(18)
      .default(18)
      .describe(
        'Address detail level, roughly corresponding to map zoom. 18=building, 16=street, 14=neighbourhood, 12=town, 10=city, 8=county, 5=state, 3=country.',
      ),
    layer: z
      .string()
      .optional()
      .describe(
        'Restrict which OSM layer is matched. Comma-separated: address, poi, railway, natural, manmade. Default: address,poi.',
      ),
    extratags: z
      .boolean()
      .default(false)
      .describe(
        'Include extra OSM tags when available (phone, website, opening_hours, wikidata, etc.).',
      ),
    language: z
      .string()
      .optional()
      .describe('Preferred language for the result (BCP 47 code or Accept-Language string).'),
  }),

  output: z.object({
    result: z
      .object({
        place_id: z.number().describe('Nominatim internal place ID.'),
        osm_type: z.enum(['node', 'way', 'relation']).optional().describe('OSM object type.'),
        osm_id: z
          .number()
          .optional()
          .describe('OSM object ID. Combine with osm_type for nominatim_lookup.'),
        lat: z.string().describe('Latitude of the matched OSM object.'),
        lon: z.string().describe('Longitude of the matched OSM object.'),
        display_name: z.string().describe('Full human-readable address.'),
        name: z.string().optional().describe('Feature name if the result is a named place.'),
        category: z
          .string()
          .optional()
          .describe('OSM feature category (e.g., "amenity", "building").'),
        type: z.string().optional().describe('OSM feature type within category.'),
        address: z
          .record(z.string(), z.string())
          .optional()
          .describe(
            'Structured address. Keys vary by feature type. Common: house_number, road, suburb, city, state, postcode, country, country_code.',
          ),
        boundingbox: z
          .tuple([z.string(), z.string(), z.string(), z.string()])
          .optional()
          .describe('Bounding box as [south, north, west, east] strings.'),
        extratags: z
          .record(z.string(), z.string())
          .optional()
          .describe(
            'Additional OSM tags (phone, website, opening_hours, wikidata). Present only when extratags was requested.',
          ),
      })
      .describe('The closest matching OSM object at the given coordinates.'),
    attribution: z.string().describe('Required data attribution.'),
  }),

  errors: [
    {
      reason: 'no_coverage',
      code: JsonRpcErrorCode.NotFound,
      when: 'Nominatim returns an error indicating no OSM data at the given coordinates (e.g., open ocean or unmapped territory).',
      recovery:
        'Verify the coordinates are correct. Try a lower zoom value to match at a coarser level (e.g., zoom=10 for city-level).',
    },
  ],

  async handler(input, ctx) {
    const service = getNominatimService();
    const raw = await service.reverse(
      {
        lat: input.lat,
        lon: input.lon,
        zoom: input.zoom,
        extratags: input.extratags,
        ...(input.layer?.trim() ? { layer: input.layer } : {}),
        ...(input.language?.trim() ? { language: input.language } : {}),
      },
      ctx,
    );

    // Nominatim returns HTTP 200 with {"error": "Unable to geocode"} for unmapped areas
    if (raw.error) {
      throw ctx.fail(
        'no_coverage',
        `No OSM data at coordinates (${input.lat}, ${input.lon}): ${raw.error}`,
        { ...ctx.recoveryFor('no_coverage') },
      );
    }

    ctx.log.info('Reverse geocode result', { display_name: raw.display_name });

    return {
      result: {
        place_id: raw.place_id,
        ...(raw.osm_type ? { osm_type: raw.osm_type } : {}),
        ...(raw.osm_id !== undefined ? { osm_id: raw.osm_id } : {}),
        lat: raw.lat,
        lon: raw.lon,
        display_name: raw.display_name,
        ...(raw.name ? { name: raw.name } : {}),
        ...(raw.category ? { category: raw.category } : {}),
        ...(raw.type ? { type: raw.type } : {}),
        ...(raw.address ? { address: raw.address } : {}),
        ...(raw.boundingbox ? { boundingbox: raw.boundingbox } : {}),
        ...(raw.extratags ? { extratags: raw.extratags } : {}),
      },
      attribution: ATTRIBUTION,
    };
  },

  format: (result) => {
    const r = result.result;
    const lines: string[] = [];
    if (r.name) lines.push(`## ${r.name}`);
    lines.push(`**Address:** ${r.display_name}`);
    lines.push(`**Coordinates:** ${r.lat}, ${r.lon}`);
    lines.push(`**Place ID:** ${r.place_id}`);
    if (r.osm_type && r.osm_id !== undefined) {
      lines.push(`**OSM:** ${r.osm_type.charAt(0).toUpperCase()}${r.osm_id}`);
    }
    if (r.category) lines.push(`**Category:** ${r.category}${r.type ? ` / ${r.type}` : ''}`);
    if (r.address) {
      const addrParts = Object.entries(r.address)
        .filter(([k]) => !['country_code', 'ISO3166-2-lvl4'].includes(k))
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ');
      if (addrParts) lines.push(`**Address details:** ${addrParts}`);
    }
    if (r.boundingbox) {
      lines.push(
        `**Bounding box:** S:${r.boundingbox[0]} N:${r.boundingbox[1]} W:${r.boundingbox[2]} E:${r.boundingbox[3]}`,
      );
    }
    if (r.extratags && Object.keys(r.extratags).length > 0) {
      const extra = Object.entries(r.extratags)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ');
      lines.push(`**Extra tags:** ${extra}`);
    }
    lines.push('');
    lines.push(`*${result.attribution}*`);
    return [{ type: 'text', text: lines.join('\n') }];
  },
});
