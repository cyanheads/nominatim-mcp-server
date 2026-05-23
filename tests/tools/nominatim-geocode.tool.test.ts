/**
 * @fileoverview Tests for the nominatim-geocode tool.
 * @module tests/tools/nominatim-geocode.tool.test
 */

import { createMockContext } from '@cyanheads/mcp-ts-core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nominatimGeocode } from '@/mcp-server/tools/definitions/nominatim-geocode.tool.js';
import type { NominatimPlace } from '@/services/nominatim/types.js';

// --- service mock --------------------------------------------------------

const mockSearch = vi.fn<() => Promise<NominatimPlace[]>>();

vi.mock('@/services/nominatim/nominatim-service.js', () => ({
  getNominatimService: () => ({ search: mockSearch }),
}));

// --- fixtures ------------------------------------------------------------

const minimalPlace: NominatimPlace = {
  place_id: 1234,
  lat: '47.6062',
  lon: '-122.3321',
  display_name: 'Seattle, King County, Washington, United States',
};

const richPlace: NominatimPlace = {
  place_id: 9999,
  osm_type: 'node',
  osm_id: 240109189,
  lat: '47.6205',
  lon: '-122.3493',
  display_name: 'Space Needle, 400, Broad Street, Seattle Center, Seattle, Washington, 98109',
  name: 'Space Needle',
  category: 'man_made',
  type: 'tower',
  importance: 0.7,
  address: { road: 'Broad Street', city: 'Seattle', state: 'Washington', country_code: 'us' },
  boundingbox: ['47.619', '47.622', '-122.352', '-122.347'],
  extratags: { wikidata: 'Q178640', website: 'https://www.spaceneedle.com' },
};

// -------------------------------------------------------------------------

describe('nominatimGeocode', () => {
  beforeEach(() => {
    mockSearch.mockReset();
  });

  describe('happy path — free-form query', () => {
    it('returns geocoding results for a valid query', async () => {
      mockSearch.mockResolvedValue([minimalPlace]);
      const ctx = createMockContext({ tenantId: 'test', errors: nominatimGeocode.errors });
      const input = nominatimGeocode.input.parse({ query: 'Seattle' });
      const result = await nominatimGeocode.handler(input, ctx);

      expect(result.total).toBe(1);
      expect(result.results[0]).toMatchObject({
        place_id: 1234,
        lat: '47.6062',
        lon: '-122.3321',
        display_name: 'Seattle, King County, Washington, United States',
      });
      expect(result.attribution).toContain('OpenStreetMap');
    });

    it('includes optional fields when present in upstream response', async () => {
      mockSearch.mockResolvedValue([richPlace]);
      const ctx = createMockContext({ tenantId: 'test', errors: nominatimGeocode.errors });
      const input = nominatimGeocode.input.parse({ query: 'Space Needle Seattle' });
      const result = await nominatimGeocode.handler(input, ctx);

      expect(result.results[0]).toMatchObject({
        osm_type: 'node',
        osm_id: 240109189,
        name: 'Space Needle',
        category: 'man_made',
        type: 'tower',
        importance: 0.7,
      });
      expect(result.results[0]?.address).toBeDefined();
      expect(result.results[0]?.extratags).toBeDefined();
    });
  });

  describe('happy path — structured query', () => {
    it('accepts structured address fields', async () => {
      mockSearch.mockResolvedValue([minimalPlace]);
      const ctx = createMockContext({ tenantId: 'test', errors: nominatimGeocode.errors });
      const input = nominatimGeocode.input.parse({ city: 'Seattle', state: 'Washington' });
      const result = await nominatimGeocode.handler(input, ctx);
      expect(result.total).toBe(1);
    });

    it('passes optional filters to the service', async () => {
      mockSearch.mockResolvedValue([minimalPlace]);
      const ctx = createMockContext({ tenantId: 'test', errors: nominatimGeocode.errors });
      const input = nominatimGeocode.input.parse({
        query: 'pharmacy',
        countrycodes: 'us',
        limit: 10,
        extratags: true,
        language: 'en',
      });
      await nominatimGeocode.handler(input, ctx);
      expect(mockSearch).toHaveBeenCalledOnce();
    });
  });

  describe('sparse upstream payload', () => {
    it('handles a place with only required fields (no optional data)', async () => {
      mockSearch.mockResolvedValue([minimalPlace]);
      const ctx = createMockContext({ tenantId: 'test', errors: nominatimGeocode.errors });
      const input = nominatimGeocode.input.parse({ query: 'Seattle' });
      const result = await nominatimGeocode.handler(input, ctx);

      const r = result.results[0]!;
      expect(r.name).toBeUndefined();
      expect(r.category).toBeUndefined();
      expect(r.osm_type).toBeUndefined();
      expect(r.address).toBeUndefined();
      expect(r.extratags).toBeUndefined();
    });
  });

  describe('error paths', () => {
    it('throws invalid_input when query and structured fields are combined', async () => {
      const ctx = createMockContext({ tenantId: 'test', errors: nominatimGeocode.errors });
      const input = nominatimGeocode.input.parse({ query: 'Seattle', city: 'Seattle' });
      await expect(nominatimGeocode.handler(input, ctx)).rejects.toMatchObject({
        data: { reason: 'invalid_input' },
      });
    });

    it('throws invalid_input when neither query nor structured fields are provided', async () => {
      const ctx = createMockContext({ tenantId: 'test', errors: nominatimGeocode.errors });
      const input = nominatimGeocode.input.parse({ limit: 5 });
      await expect(nominatimGeocode.handler(input, ctx)).rejects.toMatchObject({
        data: { reason: 'invalid_input' },
      });
    });

    it('throws no_results when the service returns empty array', async () => {
      mockSearch.mockResolvedValue([]);
      const ctx = createMockContext({ tenantId: 'test', errors: nominatimGeocode.errors });
      const input = nominatimGeocode.input.parse({ query: 'xyzzy_nowhere_place' });
      await expect(nominatimGeocode.handler(input, ctx)).rejects.toMatchObject({
        data: { reason: 'no_results' },
      });
    });

    it('propagates service errors', async () => {
      mockSearch.mockRejectedValue(new Error('Network error'));
      const ctx = createMockContext({ tenantId: 'test', errors: nominatimGeocode.errors });
      const input = nominatimGeocode.input.parse({ query: 'Seattle' });
      await expect(nominatimGeocode.handler(input, ctx)).rejects.toThrow('Network error');
    });
  });

  describe('format', () => {
    it('renders result with all key fields', () => {
      const output = {
        results: [
          {
            place_id: 9999,
            osm_type: 'node' as const,
            osm_id: 240109189,
            lat: '47.6205',
            lon: '-122.3493',
            display_name: 'Space Needle, Seattle, WA',
            name: 'Space Needle',
            category: 'man_made',
            type: 'tower',
            importance: 0.7,
          },
        ],
        total: 1,
        attribution: 'Data © OpenStreetMap contributors, ODbL 1.0',
      };
      const blocks = nominatimGeocode.format!(output);
      expect(blocks[0]!.type).toBe('text');
      const text = (blocks[0] as { text: string }).text;
      expect(text).toContain('Space Needle');
      expect(text).toContain('47.6205');
      expect(text).toContain('-122.3493');
      expect(text).toContain('9999');
      expect(text).toContain('N240109189');
      expect(text).toContain('man_made');
      expect(text).toContain('OpenStreetMap');
    });

    it('renders multiple results with total count', () => {
      const output = {
        results: [
          { place_id: 1, lat: '47.0', lon: '-122.0', display_name: 'Place A' },
          { place_id: 2, lat: '48.0', lon: '-123.0', display_name: 'Place B' },
        ],
        total: 2,
        attribution: 'Data © OpenStreetMap contributors, ODbL 1.0',
      };
      const blocks = nominatimGeocode.format!(output);
      const text = (blocks[0] as { text: string }).text;
      expect(text).toContain('2 results found');
      expect(text).toContain('Place A');
      expect(text).toContain('Place B');
    });

    it('renders bounding box and extratags when present', () => {
      const output = {
        results: [
          {
            place_id: 1,
            lat: '47.0',
            lon: '-122.0',
            display_name: 'Test Place',
            boundingbox: ['46.9', '47.1', '-122.1', '-121.9'] as [string, string, string, string],
            extratags: { website: 'https://example.com' },
          },
        ],
        total: 1,
        attribution: 'Data © OpenStreetMap contributors, ODbL 1.0',
      };
      const blocks = nominatimGeocode.format!(output);
      const text = (blocks[0] as { text: string }).text;
      expect(text).toContain('Bounding box');
      expect(text).toContain('website: https://example.com');
    });
  });
});
