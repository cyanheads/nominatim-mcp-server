/**
 * @fileoverview Tests for overpass-service retry classification and error handling.
 * @module tests/services/overpass/overpass-service.test
 */

import { JsonRpcErrorCode, McpError } from '@cyanheads/mcp-ts-core/errors';
import { describe, expect, it } from 'vitest';
import { isTransientOverpassError } from '@/services/overpass/overpass-service.js';

describe('isTransientOverpassError', () => {
  describe('deterministic failures — should NOT retry (returns false)', () => {
    it('returns false for query_timeout reason', () => {
      const err = new McpError(JsonRpcErrorCode.Timeout, 'Overpass query timed out', {
        reason: 'query_timeout',
      });
      expect(isTransientOverpassError(err)).toBe(false);
    });

    it('returns false for result_too_large reason', () => {
      const err = new McpError(JsonRpcErrorCode.ServiceUnavailable, 'Overpass ran out of memory', {
        reason: 'result_too_large',
      });
      expect(isTransientOverpassError(err)).toBe(false);
    });

    it('returns false for HTTP 400 (fetchWithTimeout FetchHttpError — malformed query)', () => {
      // fetchWithTimeout throws InvalidParams with statusCode in data, no reason field
      const err = new McpError(JsonRpcErrorCode.InvalidParams, 'Fetch failed. Status: 400', {
        statusCode: 400,
        errorSource: 'FetchHttpError',
      });
      expect(isTransientOverpassError(err)).toBe(false);
    });
  });

  describe('transient failures — should retry (returns true)', () => {
    it('returns true for rate_limited reason', () => {
      const err = new McpError(
        JsonRpcErrorCode.ServiceUnavailable,
        'Overpass API returned HTTP 429',
        { reason: 'rate_limited' },
      );
      expect(isTransientOverpassError(err)).toBe(true);
    });

    it('returns true for ServiceUnavailable without a reason (generic 5xx)', () => {
      const err = new McpError(JsonRpcErrorCode.ServiceUnavailable, 'Overpass unavailable');
      expect(isTransientOverpassError(err)).toBe(true);
    });

    it('returns true for plain Error (network error, DNS failure, etc.)', () => {
      expect(isTransientOverpassError(new Error('ECONNREFUSED'))).toBe(true);
    });

    it('returns true for ValidationError with query_error reason (service-layer path)', () => {
      // If a ValidationError with reason 'query_error' reaches withRetry, withRetry's
      // own code check (ValidationError is not in TRANSIENT_CODES) stops the retry.
      // isTransientOverpassError doesn't need to exclude it.
      const err = new McpError(JsonRpcErrorCode.ValidationError, 'Malformed query', {
        reason: 'query_error',
      });
      expect(isTransientOverpassError(err)).toBe(true);
    });

    it('returns true for non-McpError values', () => {
      expect(isTransientOverpassError('string error')).toBe(true);
      expect(isTransientOverpassError(null)).toBe(true);
      expect(isTransientOverpassError(undefined)).toBe(true);
      expect(isTransientOverpassError(42)).toBe(true);
    });
  });
});
