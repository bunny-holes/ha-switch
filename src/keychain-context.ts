import { logger } from "./log.ts";

const log = logger("keychain-context");

export interface KeychainContext {
  unlocked?: boolean;
  hasGraphicAccess?: boolean;
}

export async function readKeychainContext(): Promise<KeychainContext> {
  if (process.platform !== "darwin") return {};
  try {
    const { dlopen, ptr } = await import("bun:ffi");
    const library = dlopen("/System/Library/Frameworks/Security.framework/Security", {
      SecKeychainGetStatus: { args: ["ptr", "ptr"], returns: "i32" },
      SessionGetInfo: { args: ["u32", "ptr", "ptr"], returns: "i32" },
    });
    try {
      const keychain = new Uint32Array(1);
      const session = new Uint32Array(1);
      const attributes = new Uint32Array(1);
      const keychainStatus = library.symbols.SecKeychainGetStatus(null, ptr(keychain));
      const sessionStatus = library.symbols.SessionGetInfo(
        0xffffffff,
        ptr(session),
        ptr(attributes),
      );
      return {
        ...(keychainStatus === 0 ? { unlocked: Boolean(keychain[0] & 1) } : {}),
        ...(sessionStatus === 0 ? { hasGraphicAccess: Boolean(attributes[0] & 0x10) } : {}),
      };
    } finally {
      library.close();
    }
  } catch {
    // Diagnostics must not replace the original credential boundary error.
    log("status_unavailable", {}, "debug");
    return {};
  }
}
