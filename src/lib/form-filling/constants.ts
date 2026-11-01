/** Supported form field types. */
export const FIELD_TYPES = [
  "string",
  "number",
  "boolean",
  "array",
  "object",
] as const;

export type FieldType = (typeof FIELD_TYPES)[number];

export function isFieldType(value: string): value is FieldType {
  return (FIELD_TYPES as readonly string[]).includes(value);
}

/** Types that carry a nested field schema. */
export function fieldTypeHasNestedFields(type: FieldType): boolean {
  return type === "object" || type === "array";
}

/**
 * Nested field definition (recursive).
 * - `object`: `fields` describes the object shape
 * - `array`: `fields` describes each item as an object (object array)
 */
export type NestedFieldDef = {
  key: string;
  type: FieldType;
  fields?: NestedFieldDef[];
};
