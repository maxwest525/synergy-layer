/**
 * A stored instant in the operator's words. Lived in primitives.tsx, where a
 * non-component export costs every screen a full reload on hot refresh
 * (CQ-10); nothing about it needs React.
 */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatWhen(value: string | null | undefined): string {
  if (!value) return "Never";
  // Manual UTC formatting: Intl output differs between the server and browser ICU builds.
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Never";
  const hours24 = date.getUTCHours();
  const suffix = hours24 >= 12 ? "PM" : "AM";
  const hours = hours24 % 12 === 0 ? 12 : hours24 % 12;
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}, ${String(hours).padStart(2, "0")}:${minutes} ${suffix}`;
}
