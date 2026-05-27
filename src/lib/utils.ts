/**
 * Formats a property ref_id into the display format PRP-XXXX.
 * Falls back to "ID: {id}" if ref_id is not a valid number.
 */
export function formatPropId(ref_id: any, id?: any): string {
  if (ref_id && !isNaN(Number(ref_id))) {
    return `PRP-${Number(ref_id).toString().padStart(4, "0")}`;
  }
  return id ? `ID: ${id}` : "--";
}
