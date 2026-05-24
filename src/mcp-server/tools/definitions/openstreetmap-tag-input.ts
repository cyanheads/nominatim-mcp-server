/**
 * @fileoverview Shared tag input validation and resolution for Overpass convenience tools.
 * @module mcp-server/tools/definitions/openstreetmap-tag-input
 */

/** Resolved tag key/value pair extracted from amenity shortcut or explicit tag_key/tag_value. */
export type ResolvedTag = { tagKey: string; tagValue: string };

/**
 * Validate and resolve the mutually-exclusive amenity / tag_key+tag_value input pattern.
 * Throws an error string on invalid input; callers translate it to ctx.fail.
 */
export function resolveTagInput(input: {
  amenity?: string | undefined;
  tag_key?: string | undefined;
  tag_value?: string | undefined;
}): ResolvedTag | { error: 'both' | 'neither' } {
  const hasAmenity = Boolean(input.amenity?.trim());
  const hasTagKey = Boolean(input.tag_key?.trim());
  const hasTagValue = Boolean(input.tag_value?.trim());

  if (hasAmenity && (hasTagKey || hasTagValue)) return { error: 'both' };
  if (!hasAmenity && !hasTagKey) return { error: 'neither' };

  return {
    tagKey: hasAmenity ? 'amenity' : (input.tag_key ?? ''),
    tagValue: hasAmenity ? (input.amenity ?? '') : (input.tag_value ?? ''),
  };
}
