export function describeSeoRunFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (
    /not configured|missing environment|missing .*credential|credential.*missing/i.test(message)
  ) {
    return "Required connector credentials are not configured.";
  }
  if (/evidence|search console|\bgsc\b|dataforseo/i.test(message)) {
    return "Required page evidence is incomplete.";
  }
  return "SEO run evaluation failed. Review connector health and try again.";
}
