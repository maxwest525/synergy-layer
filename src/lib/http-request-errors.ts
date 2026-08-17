function errorChain(error: unknown): Error[] {
  const chain: Error[] = [];
  let current = error;

  for (let depth = 0; depth < 5 && current instanceof Error; depth += 1) {
    chain.push(current);
    current = current.cause;
  }

  return chain;
}

/**
 * Node raises this exact error after the browser closes a request socket while
 * the server is still reading it. It is a transport cancellation, not an AOOS
 * application failure, and should not be promoted to the preview error overlay.
 */
export function isIncomingRequestAbort(error: unknown): boolean {
  return errorChain(error).some((candidate) => {
    const stack = candidate.stack ?? "";
    return (
      candidate.message === "aborted" &&
      stack.includes("node:_http_server") &&
      (stack.includes("abortIncoming") || stack.includes("socketOnClose"))
    );
  });
}

export function cancelledRequestResponse(): Response {
  return new Response(null, { status: 499, statusText: "Client Closed Request" });
}