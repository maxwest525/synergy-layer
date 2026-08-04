/** Minimal 5-field cron support: `*`, numbers, lists, ranges, and steps. */
function matchesField(field: string, value: number): boolean {
  return field.split(",").some((part) => {
    const [rangePart, stepPart] = part.split("/");
    const step = stepPart ? Number(stepPart) : 1;
    if (rangePart === "*" || rangePart === undefined) return value % step === 0;
    if (rangePart.includes("-")) {
      const [start, end] = rangePart.split("-").map(Number);
      return value >= start! && value <= end! && (value - start!) % step === 0;
    }
    return Number(rangePart) === value;
  });
}

export function matchesCron(expression: string, date: Date): boolean {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) return false;
  const [minute, hour, dayOfMonth, month, dayOfWeek] = fields as [
    string,
    string,
    string,
    string,
    string,
  ];
  return (
    matchesField(minute, date.getUTCMinutes()) &&
    matchesField(hour, date.getUTCHours()) &&
    matchesField(dayOfMonth, date.getUTCDate()) &&
    matchesField(month, date.getUTCMonth() + 1) &&
    matchesField(dayOfWeek, date.getUTCDay())
  );
}

/** Next matching minute within the following year, or null when unreachable. */
export function nextRunAt(expression: string, from: Date): Date | null {
  const cursor = new Date(from.getTime());
  cursor.setUTCSeconds(0, 0);
  for (let index = 0; index < 60 * 24 * 366; index += 1) {
    cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);
    if (matchesCron(expression, cursor)) return new Date(cursor.getTime());
  }
  return null;
}
