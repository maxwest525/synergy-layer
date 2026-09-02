/**
 * The confidence a graded verdict rests on, as the operator reads it. A
 * 0.4 and a 0.9 must not render the same (CODE-55).
 */
export function confidenceWords(
  confidence: { value: number; band: string } | null | undefined,
): string | null {
  if (!confidence) return null;
  return `Confidence ${Math.round(confidence.value * 100)}% (${confidence.band}).`;
}
