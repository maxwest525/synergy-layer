// Captures the original Error out-of-band so server.ts can recover the stack
// when h3 has already swallowed the throw into a generic 500 Response.

import { isIncomingRequestAbort } from "./http-request-errors";
import { AsyncLocalStorage } from "node:async_hooks";

type ErrorCaptureState = {
  capturedErrors: Map<symbol, { error: unknown; at: number }>;
  consoleInstalled?: boolean;
  listenersInstalled?: boolean;
  originalConsoleError?: typeof console.error;
};

const errorCaptureKey = Symbol.for("aoos.error-capture");
const errorCaptureGlobal = globalThis as typeof globalThis & {
  [errorCaptureKey]?: ErrorCaptureState;
};
const state = (errorCaptureGlobal[errorCaptureKey] ??= { capturedErrors: new Map() });
const requestScope = new AsyncLocalStorage<symbol>();
const TTL_MS = 5_000;

function record(error: unknown) {
  const requestId = requestScope.getStore();
  if (requestId) state.capturedErrors.set(requestId, { error, at: Date.now() });
}

export function runWithErrorCapture<T>(operation: () => T): T {
  return requestScope.run(Symbol("request-error-capture"), operation);
}

// h3's HTTPError serializes to {"status":500,"unhandled":true,"message":"HTTPError"} —
// no stack, no cause — so a plain console.error(error) reaches the log pipeline with
// the failure detail stripped. Expand Error-like args into a string that keeps the
// message, stack, and the full cause chain.
const CAUSE_DEPTH_LIMIT = 5;
const DESCRIPTION_LENGTH_LIMIT = 8_000;

export function describeError(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < CAUSE_DEPTH_LIMIT && current != null; depth++) {
    if (!(current instanceof Error)) {
      parts.push(typeof current === "string" ? current : safeStringify(current));
      break;
    }
    const label = depth === 0 ? "" : "caused by: ";
    const status = describeStatus(current);
    parts.push(`${label}${current.stack ?? `${current.name}: ${current.message}`}${status}`);
    current = current.cause;
  }
  return parts.join("\n").slice(0, DESCRIPTION_LENGTH_LIMIT);
}

function describeStatus(error: Error): string {
  const { status, statusCode } = error as { status?: unknown; statusCode?: unknown };
  const value = status ?? statusCode;
  return typeof value === "number" ? ` (status ${value})` : "";
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

function isErrorLike(value: unknown): value is Error {
  return value instanceof Error;
}

// Wrap console.error so errors logged by any layer — including h3's internal
// unhandled-error logging, which this file cannot hook directly — are both
// recorded for consumeLastCapturedError and expanded before serialization.
if (!state.consoleInstalled) {
  state.originalConsoleError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    const incomingAbort = args.find(isIncomingRequestAbort);
    if (incomingAbort !== undefined) {
      record(incomingAbort);
      return;
    }
    const expanded = args.map((arg) => {
      if (!isErrorLike(arg)) return arg;
      record(arg);
      return describeError(arg);
    });
    state.originalConsoleError?.(...expanded);
  };
  state.consoleInstalled = true;
}

if (!state.listenersInstalled && typeof globalThis.addEventListener === "function") {
  globalThis.addEventListener("error", (event) => record((event as ErrorEvent).error ?? event));
  globalThis.addEventListener("unhandledrejection", (event) =>
    record((event as PromiseRejectionEvent).reason),
  );
  state.listenersInstalled = true;
}

export function consumeLastCapturedError(): unknown {
  const requestId = requestScope.getStore();
  if (!requestId) return undefined;
  const captured = state.capturedErrors.get(requestId);
  state.capturedErrors.delete(requestId);
  if (!captured || Date.now() - captured.at > TTL_MS) {
    return undefined;
  }
  return captured.error;
}
