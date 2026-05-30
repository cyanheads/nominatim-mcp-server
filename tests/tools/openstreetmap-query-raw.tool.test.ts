/**
 * @fileoverview Tests for the openstreetmap-query-raw tool.
 * @module tests/tools/openstreetmap-query-raw.tool.test
 */

import { createMockContext, getEnrichment } from '@cyanheads/mcp-ts-core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { openstreetmapQueryRaw } from '@/mcp-server/tools/definitions/openstreetmap-query-raw.tool.js';
import type { OverpassElement, OverpassResponse } from '@/services/overpass/types.js';

// --- service mock --------------------------------------------------------

const mockQuery = vi.fn<() => Promise<OverpassResponse>>();

vi.mock('@/services/overpass/overpass-service.js', () => ({
  getOverpassService: () => ({ query: mockQuery }),
}));

// --- fixtures ------------------------------------------------------------

const peakElement: OverpassElement = {
  type: 'node',
  id: 987654321,
  lat: 47.62,
  lon: -122.35,
  tags: { natural: 'peak', name: 'Mt Rainier', ele: '4392' },
};

const responseWithTimestamp: OverpassResponse = {
  version: 0.6,
  osm3s: { timestamp_osm_base: '2025-03-01T12:00:00Z' },
  elements: [peakElement],
};

const responseWithoutTimestamp: OverpassResponse = {
  version: 0.6,
  elements: [peakElement],
};

const VALID_QUERY =
  '[out:json][timeout:15];node["natural"="peak"](47.5,-122.5,47.7,-122.2);out body;';
const QUERY_WITHOUT_TIMEOUT =
  '[out:json];node["natural"="peak"](47.5,-122.5,47.7,-122.2);out body;';

// -------------------------------------------------------------------------

describe('openstreetmapQueryRaw', () => {
  beforeEach(() => {
    mockQuery.mockReset().mockResolvedValue(responseWithTimestamp);
  });

  describe('happy path', () => {
    it('returns raw elements from a valid query', async () => {
      const ctx = createMockContext({ tenantId: 'test', errors: openstreetmapQueryRaw.errors });
      const input = openstreetmapQueryRaw.input.parse({ query: VALID_QUERY });
      const result = await openstreetmapQueryRaw.handler(input, ctx);

      expect(result.total_elements).toBe(1);
      expect(result.elements).toHaveLength(1);
      expect(result.elements[0]).toMatchObject({ type: 'node', id: 987654321 });
      expect(result.data_timestamp).toBe('2025-03-01T12:00:00Z');
      expect(result.attribution).toContain('OpenStreetMap');

      const enrichment = getEnrichment(ctx);
      expect(enrichment.effectiveQuery).toContain('[out:json]');
      expect(enrichment.notice).toBeUndefined();
    });

    it('injects [timeout:N] when query lacks a timeout directive', async () => {
      const ctx = createMockContext({ tenantId: 'test', errors: openstreetmapQueryRaw.errors });
      const input = openstreetmapQueryRaw.input.parse({
        query: QUERY_WITHOUT_TIMEOUT,
        timeout_seconds: 45,
      });
      await openstreetmapQueryRaw.handler(input, ctx);

      const calledQuery = mockQuery.mock.calls[0]?.[0] as string;
      expect(calledQuery).toContain('[timeout:45]');
    });

    it('does not inject timeout when query already includes [timeout:]', async () => {
      const ctx = createMockContext({ tenantId: 'test', errors: openstreetmapQueryRaw.errors });
      const input = openstreetmapQueryRaw.input.parse({ query: VALID_QUERY });
      await openstreetmapQueryRaw.handler(input, ctx);

      const calledQuery = mockQuery.mock.calls[0]?.[0] as string;
      // Should preserve the original timeout, not add a second one
      expect(calledQuery.match(/\[timeout:/g)).toHaveLength(1);
    });

    it('handles multiple elements', async () => {
      const elements: OverpassElement[] = Array.from({ length: 5 }, (_, i) => ({
        type: 'node' as const,
        id: i + 1,
        lat: 47.6 + i * 0.01,
        lon: -122.3,
        tags: { natural: 'peak' },
      }));
      mockQuery.mockResolvedValue({ ...responseWithTimestamp, elements });
      const ctx = createMockContext({ tenantId: 'test', errors: openstreetmapQueryRaw.errors });
      const input = openstreetmapQueryRaw.input.parse({ query: VALID_QUERY });
      const result = await openstreetmapQueryRaw.handler(input, ctx);
      expect(result.total_elements).toBe(5);
      expect(result.elements).toHaveLength(5);
    });
  });

  describe('enrichment', () => {
    it('echoes the effective query (with injected timeout)', async () => {
      const ctx = createMockContext({ tenantId: 'test', errors: openstreetmapQueryRaw.errors });
      const input = openstreetmapQueryRaw.input.parse({
        query: QUERY_WITHOUT_TIMEOUT,
        timeout_seconds: 45,
      });
      await openstreetmapQueryRaw.handler(input, ctx);
      const enrichment = getEnrichment(ctx);
      expect(enrichment.effectiveQuery).toContain('[timeout:45]');
    });

    it('sets notice when no elements are returned', async () => {
      mockQuery.mockResolvedValue({ ...responseWithTimestamp, elements: [] });
      const ctx = createMockContext({ tenantId: 'test', errors: openstreetmapQueryRaw.errors });
      const input = openstreetmapQueryRaw.input.parse({ query: VALID_QUERY });
      await openstreetmapQueryRaw.handler(input, ctx);
      const enrichment = getEnrichment(ctx);
      expect(enrichment.notice).toBeDefined();
      expect(enrichment.notice).toContain('No elements returned');
    });
  });

  describe('missing timestamp', () => {
    it('omits data_timestamp when osm3s is absent', async () => {
      mockQuery.mockResolvedValue(responseWithoutTimestamp);
      const ctx = createMockContext({ tenantId: 'test', errors: openstreetmapQueryRaw.errors });
      const input = openstreetmapQueryRaw.input.parse({ query: VALID_QUERY });
      const result = await openstreetmapQueryRaw.handler(input, ctx);
      expect(result.data_timestamp).toBeUndefined();
    });
  });

  describe('error paths', () => {
    it('propagates service errors (timeout, OOM, rate-limit etc.)', async () => {
      mockQuery.mockRejectedValue(new Error('Overpass query timed out'));
      const ctx = createMockContext({ tenantId: 'test', errors: openstreetmapQueryRaw.errors });
      const input = openstreetmapQueryRaw.input.parse({ query: VALID_QUERY });
      await expect(openstreetmapQueryRaw.handler(input, ctx)).rejects.toThrow(
        'Overpass query timed out',
      );
    });
  });

  describe('format', () => {
    it('renders elements with type, id, and tags', () => {
      const output = {
        elements: [
          {
            type: 'node',
            id: 987654321,
            lat: 47.62,
            lon: -122.35,
            tags: { natural: 'peak', name: 'Mt Rainier' },
          },
        ],
        total_elements: 1,
        data_timestamp: '2025-03-01T12:00:00Z',
        attribution: 'Data © OpenStreetMap contributors, ODbL 1.0',
      };
      const blocks = openstreetmapQueryRaw.format!(output);
      expect(blocks[0]!.type).toBe('text');
      const text = (blocks[0] as { text: string }).text;
      expect(text).toContain('1 element returned');
      expect(text).toContain('node');
      expect(text).toContain('987654321');
      expect(text).toContain('Mt Rainier');
      expect(text).toContain('natural=peak');
      expect(text).toContain('2025-03-01');
      expect(text).toContain('OpenStreetMap');
    });

    it('renders "elements returned" in singular for one element', () => {
      const output = {
        elements: [{ type: 'node', id: 1 }],
        total_elements: 1,
        attribution: 'Data © OpenStreetMap contributors, ODbL 1.0',
      };
      const blocks = openstreetmapQueryRaw.format!(output);
      const text = (blocks[0] as { text: string }).text;
      expect(text).toContain('1 element returned');
    });

    it('renders overflow notice for >50 elements', () => {
      const elements = Array.from({ length: 75 }, (_, i) => ({ type: 'node', id: i + 1 }));
      const output = {
        elements,
        total_elements: 75,
        attribution: 'Data © OpenStreetMap contributors, ODbL 1.0',
      };
      const blocks = openstreetmapQueryRaw.format!(output);
      const text = (blocks[0] as { text: string }).text;
      expect(text).toContain('25 more elements');
    });

    it('omits data_timestamp line when absent', () => {
      const output = {
        elements: [{ type: 'node', id: 1 }],
        total_elements: 1,
        attribution: 'Data © OpenStreetMap contributors, ODbL 1.0',
      };
      const blocks = openstreetmapQueryRaw.format!(output);
      const text = (blocks[0] as { text: string }).text;
      expect(text).not.toContain('Data as of:');
    });
  });
});
