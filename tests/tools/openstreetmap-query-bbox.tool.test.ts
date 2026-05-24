/**
 * @fileoverview Tests for the openstreetmap-query-bbox tool.
 * @module tests/tools/openstreetmap-query-bbox.tool.test
 */

import { createMockContext } from '@cyanheads/mcp-ts-core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { openstreetmapQueryBbox } from '@/mcp-server/tools/definitions/openstreetmap-query-bbox.tool.js';
import type { OverpassElement, OverpassPoi, OverpassResponse } from '@/services/overpass/types.js';

// --- service mock --------------------------------------------------------

const mockBuildBboxQuery = vi.fn<() => string>(
  () =>
    '[out:json][timeout:25];(node["amenity"="pharmacy"](47.5,-122.5,47.7,-122.2););out center tags;',
);
const mockQuery = vi.fn<() => Promise<OverpassResponse>>();
const mockNormalizeElements = vi.fn<(els: OverpassElement[]) => OverpassPoi[]>();

vi.mock('@/services/overpass/overpass-service.js', () => ({
  getOverpassService: () => ({
    buildBboxQuery: mockBuildBboxQuery,
    query: mockQuery,
    normalizeElements: mockNormalizeElements,
  }),
}));

// --- fixtures ------------------------------------------------------------

const mockElement: OverpassElement = {
  type: 'way',
  id: 444555666,
  center: { lat: 47.62, lon: -122.35 },
  tags: { amenity: 'pharmacy', name: 'Green Pharmacy' },
};

const mockPoi: OverpassPoi = {
  osm_type: 'way',
  osm_id: 444555666,
  lat: 47.62,
  lon: -122.35,
  name: 'Green Pharmacy',
  tags: { amenity: 'pharmacy', name: 'Green Pharmacy' },
};

const mockResponse: OverpassResponse = {
  version: 0.6,
  osm3s: { timestamp_osm_base: '2025-02-01T00:00:00Z' },
  elements: [mockElement],
};

// -------------------------------------------------------------------------

describe('openstreetmapQueryBbox', () => {
  beforeEach(() => {
    mockBuildBboxQuery.mockReset().mockReturnValue('[out:json]');
    mockQuery.mockReset().mockResolvedValue(mockResponse);
    mockNormalizeElements.mockReset().mockReturnValue([mockPoi]);
  });

  describe('happy path — amenity shortcut', () => {
    it('returns features within the bounding box', async () => {
      const ctx = createMockContext({ tenantId: 'test', errors: openstreetmapQueryBbox.errors });
      const input = openstreetmapQueryBbox.input.parse({
        south: 47.5,
        west: -122.5,
        north: 47.7,
        east: -122.2,
        amenity: 'pharmacy',
      });
      const result = await openstreetmapQueryBbox.handler(input, ctx);

      expect(result.total_found).toBe(1);
      expect(result.elements).toHaveLength(1);
      expect(result.elements[0]).toMatchObject({
        osm_type: 'way',
        osm_id: 444555666,
        name: 'Green Pharmacy',
      });
      expect(result.truncated).toBe(false);
      expect(result.data_timestamp).toBe('2025-02-01T00:00:00Z');
      expect(result.attribution).toContain('OpenStreetMap');
    });

    it('passes correct bbox parameters to buildBboxQuery', async () => {
      const ctx = createMockContext({ tenantId: 'test', errors: openstreetmapQueryBbox.errors });
      const input = openstreetmapQueryBbox.input.parse({
        south: 47.5,
        west: -122.5,
        north: 47.7,
        east: -122.2,
        amenity: 'cafe',
        element_types: ['node'],
        timeout_seconds: 40,
      });
      await openstreetmapQueryBbox.handler(input, ctx);
      expect(mockBuildBboxQuery).toHaveBeenCalledWith({
        south: 47.5,
        west: -122.5,
        north: 47.7,
        east: -122.2,
        tagKey: 'amenity',
        tagValue: 'cafe',
        elementTypes: ['node'],
        timeoutSeconds: 40,
      });
    });
  });

  describe('happy path — tag_key/tag_value', () => {
    it('uses tag_key and tag_value when amenity is absent', async () => {
      const ctx = createMockContext({ tenantId: 'test', errors: openstreetmapQueryBbox.errors });
      const input = openstreetmapQueryBbox.input.parse({
        south: 47.5,
        west: -122.5,
        north: 47.7,
        east: -122.2,
        tag_key: 'natural',
        tag_value: 'peak',
      });
      await openstreetmapQueryBbox.handler(input, ctx);
      expect(mockBuildBboxQuery).toHaveBeenCalledWith(
        expect.objectContaining({ tagKey: 'natural', tagValue: 'peak' }),
      );
    });
  });

  describe('truncation', () => {
    it('marks result as truncated when more features exist than the limit', async () => {
      const pois: OverpassPoi[] = Array.from({ length: 30 }, (_, i) => ({
        osm_type: 'node' as const,
        osm_id: i + 1,
        tags: { amenity: 'cafe' },
      }));
      mockNormalizeElements.mockReturnValue(pois);

      const ctx = createMockContext({ tenantId: 'test', errors: openstreetmapQueryBbox.errors });
      const input = openstreetmapQueryBbox.input.parse({
        south: 47.5,
        west: -122.5,
        north: 47.7,
        east: -122.2,
        amenity: 'cafe',
        limit: 20,
      });
      const result = await openstreetmapQueryBbox.handler(input, ctx);
      expect(result.total_found).toBe(30);
      expect(result.elements).toHaveLength(20);
      expect(result.truncated).toBe(true);
    });
  });

  describe('missing timestamp fallback', () => {
    it('uses current ISO timestamp when osm3s is absent', async () => {
      mockQuery.mockResolvedValue({ version: 0.6, elements: [mockElement] });
      const ctx = createMockContext({ tenantId: 'test', errors: openstreetmapQueryBbox.errors });
      const input = openstreetmapQueryBbox.input.parse({
        south: 47.5,
        west: -122.5,
        north: 47.7,
        east: -122.2,
        amenity: 'cafe',
      });
      const result = await openstreetmapQueryBbox.handler(input, ctx);
      expect(result.data_timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe('error paths', () => {
    it('throws invalid_tag when amenity and tag_key are combined', async () => {
      const ctx = createMockContext({ tenantId: 'test', errors: openstreetmapQueryBbox.errors });
      const input = openstreetmapQueryBbox.input.parse({
        south: 47.5,
        west: -122.5,
        north: 47.7,
        east: -122.2,
        amenity: 'cafe',
        tag_key: 'leisure',
        tag_value: 'park',
      });
      await expect(openstreetmapQueryBbox.handler(input, ctx)).rejects.toMatchObject({
        data: { reason: 'invalid_tag' },
      });
    });

    it('throws invalid_tag when neither amenity nor tag_key is provided', async () => {
      const ctx = createMockContext({ tenantId: 'test', errors: openstreetmapQueryBbox.errors });
      const input = openstreetmapQueryBbox.input.parse({
        south: 47.5,
        west: -122.5,
        north: 47.7,
        east: -122.2,
      });
      await expect(openstreetmapQueryBbox.handler(input, ctx)).rejects.toMatchObject({
        data: { reason: 'invalid_tag' },
      });
    });

    it('propagates service errors', async () => {
      mockQuery.mockRejectedValue(new Error('Overpass 503'));
      const ctx = createMockContext({ tenantId: 'test', errors: openstreetmapQueryBbox.errors });
      const input = openstreetmapQueryBbox.input.parse({
        south: 47.5,
        west: -122.5,
        north: 47.7,
        east: -122.2,
        amenity: 'cafe',
      });
      await expect(openstreetmapQueryBbox.handler(input, ctx)).rejects.toThrow('Overpass 503');
    });
  });

  describe('format', () => {
    it('renders element with all key fields', () => {
      const output = {
        elements: [
          {
            osm_type: 'way' as const,
            osm_id: 444555666,
            lat: 47.62,
            lon: -122.35,
            name: 'Green Pharmacy',
            tags: { amenity: 'pharmacy', name: 'Green Pharmacy' },
          },
        ],
        total_found: 1,
        truncated: false,
        data_timestamp: '2025-02-01T00:00:00Z',
        attribution: 'Data © OpenStreetMap contributors, ODbL 1.0',
      };
      const blocks = openstreetmapQueryBbox.format!(output);
      expect(blocks[0]!.type).toBe('text');
      const text = (blocks[0] as { text: string }).text;
      expect(text).toContain('Green Pharmacy');
      expect(text).toContain('W444555666');
      expect(text).toContain('47.62');
      expect(text).toContain('-122.35');
      expect(text).toContain('amenity=pharmacy');
      expect(text).toContain('OpenStreetMap');
    });

    it('renders truncation notice', () => {
      const output = {
        elements: [{ osm_type: 'node' as const, osm_id: 1, tags: { amenity: 'cafe' } }],
        total_found: 50,
        truncated: true,
        data_timestamp: '2025-02-01T00:00:00Z',
        attribution: 'Data © OpenStreetMap contributors, ODbL 1.0',
      };
      const blocks = openstreetmapQueryBbox.format!(output);
      const text = (blocks[0] as { text: string }).text;
      expect(text).toContain('50 features found');
      expect(text).toContain('results truncated');
    });
  });
});
