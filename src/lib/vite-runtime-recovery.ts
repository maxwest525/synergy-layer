type RecoveryStorage = Pick<Storage, "getItem" | "setItem">;

type RecoveryRuntime = {
  storage: RecoveryStorage;
  reload: () => void;
  now: () => number;
};

type VitePreloadRecoveryRuntime = RecoveryRuntime & {
  target: EventTarget;
};

const recoveryTimestampKey = "aoos:vite-runtime-recovery";
const recoveryCooldownMs = 30_000;

function requestRuntimeReload(runtime: RecoveryRuntime) {
  const previousValue = runtime.storage.getItem(recoveryTimestampKey);
  const previousTimestamp = previousValue === null ? null : Number(previousValue);
  if (
    previousTimestamp !== null &&
    Number.isFinite(previousTimestamp) &&
    runtime.now() - previousTimestamp < recoveryCooldownMs
  ) {
    return false;
  }

  runtime.storage.setItem(recoveryTimestampKey, String(runtime.now()));
  runtime.reload();
  return true;
}

export function installVitePreloadRecovery(runtime: VitePreloadRecoveryRuntime) {
  const handlePreloadError = (event: Event) => {
    event.preventDefault();
    requestRuntimeReload(runtime);
  };
  runtime.target.addEventListener("vite:preloadError", handlePreloadError);
  return () => runtime.target.removeEventListener("vite:preloadError", handlePreloadError);
}

export function requestRouterRuntimeRecovery(error: unknown, runtime: RecoveryRuntime) {
  const message = error instanceof Error ? error.message : String(error);
  if (
    !/Duplicate routes found with id:|Failed to fetch dynamically imported module|Lazy entry module not found in cache/i.test(
      message,
    )
  ) {
    return false;
  }
  return requestRuntimeReload(runtime);
}
