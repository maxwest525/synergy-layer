import { createStart, createCsrfMiddleware, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { cancelledRequestResponse, isIncomingRequestAbort } from "./lib/http-request-errors";
import { attachStoredAuth } from "./lib/server-function-auth";

const errorMiddleware = createMiddleware().server(async ({ next, request }) => {
  try {
    return await next();
  } catch (error) {
    // A closed socket is a transport cancellation, not an app failure.
    if (isIncomingRequestAbort(error) || request?.signal.aborted) {
      return cancelledRequestResponse();
    }
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

// Start installs this automatically when src/start.ts is absent; defining the
// file opts out, so re-add it explicitly to keep server functions protected
// from cross-site requests.
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachStoredAuth],
  requestMiddleware: [errorMiddleware, csrfMiddleware],
}));
