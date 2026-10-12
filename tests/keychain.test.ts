import { describe, expect, test } from "bun:test";
import { PoolError } from "../src/errors.ts";
import { keychainErrorMessage, keychainFailure } from "../src/keychain.ts";

describe("keychain failures", () => {
  test.each([
    ["ERR_SECRETS_INTERACTION_NOT_ALLOWED", "keychain_interaction_not_allowed"],
    ["ERR_SECRETS_INTERACTION_REQUIRED", "keychain_interaction_not_allowed"],
    ["ERR_SECRETS_AUTH_FAILED", "keychain_access_denied"],
    ["ERR_SECRETS_ACCESS_DENIED", "keychain_access_denied"],
    ["ERR_SECRETS_USER_CANCELED", "keychain_access_denied"],
    ["ERR_SECRETS_NOT_FOUND", "keychain_item_missing"],
    ["ERR_SECRETS_ITEM_NOT_FOUND", "keychain_item_missing"],
  ])("classifies native code %s", (code, expected) => {
    expect(keychainFailure({ code }).code).toBe(expected);
  });

  test.each([
    [-25308, "keychain_interaction_not_allowed"],
    [-25315, "keychain_interaction_not_allowed"],
    [-25293, "keychain_access_denied"],
    [-128, "keychain_access_denied"],
    [-25300, "keychain_item_missing"],
    [-25291, "keychain_unavailable"],
  ])("classifies OSStatus %s from native error fields", (status, expected) => {
    for (const field of ["code", "errno", "status"]) {
      expect(keychainFailure({ [field]: status }).code).toBe(expected);
    }
  });

  test("unknown failures keep the failed operation and hide raw data", () => {
    const raw = new Error("synthetic-private-value: errSecAuthFailed -25293");
    for (const operation of ["read", "write"] as const) {
      const failure = keychainFailure(raw, operation);
      expect(failure).toBeInstanceOf(PoolError);
      expect(failure.code).toBe(`keychain_${operation}_failed`);
      expect(failure.message.includes(raw.message)).toBe(false);
      expect(failure.cause).toBeUndefined();
      expect(keychainErrorMessage(failure.code).includes(raw.message)).toBe(false);
    }
  });

  test("null and unstructured errors are recoverable safe failures", () => {
    for (const error of [null, undefined, 36, "synthetic-private-value", {}]) {
      expect(keychainFailure(error).code).toBe("keychain_read_failed");
    }
  });

  test("known boundary errors retain their classification", () => {
    for (const code of [
      "keychain_locked",
      "keychain_no_gui_session",
      "keychain_interaction_not_allowed",
      "keychain_access_denied",
      "keychain_item_missing",
      "keychain_unavailable",
    ]) {
      expect(keychainFailure(new PoolError(code)).code).toBe(code);
    }
  });

  test.each([
    [{ unlocked: false, hasGraphicAccess: false }, "keychain_locked"],
    [{ unlocked: false, hasGraphicAccess: true }, "keychain_locked"],
    [{ unlocked: true, hasGraphicAccess: false }, "keychain_no_gui_session"],
    [{ hasGraphicAccess: false }, "keychain_no_gui_session"],
    [{ unlocked: true, hasGraphicAccess: true }, "keychain_interaction_not_allowed"],
    [{ unlocked: true }, "keychain_interaction_not_allowed"],
    [{}, "keychain_interaction_not_allowed"],
  ])("uses measured session context for interaction failures", (context, expected) => {
    for (const error of [
      { code: "ERR_SECRETS_INTERACTION_NOT_ALLOWED" },
      { status: -25308 },
      { code: "ERR_SECRETS_INTERACTION_REQUIRED" },
    ]) {
      expect(keychainFailure(error, "read", context).code).toBe(expected);
    }
  });

  test("session context does not change unrelated failures", () => {
    const context = { unlocked: false, hasGraphicAccess: false };
    expect(keychainFailure({ status: -25293 }, "read", context).code).toBe(
      "keychain_access_denied",
    );
    expect(keychainFailure({ status: -25300 }, "read", context).code).toBe("keychain_item_missing");
    expect(keychainFailure(new Error("synthetic failure"), "write", context).code).toBe(
      "keychain_write_failed",
    );
  });

  test("locked guidance unlocks, remote session guidance does not repeat unlock advice", () => {
    const locked = keychainErrorMessage("keychain_locked");
    const remote = keychainErrorMessage("keychain_no_gui_session");
    expect(locked).toContain("security unlock-keychain ~/Library/Keychains/login.keychain-db");
    expect(remote).toContain("Terminal");
    expect(remote).not.toContain("unlock-keychain");
    expect(remote).not.toContain("\n");
    expect(locked).not.toContain("\n");
  });

  test("interaction guidance gives an unlock command without a password argument", () => {
    const message = keychainErrorMessage("keychain_interaction_not_allowed");
    expect(message).toContain("security unlock-keychain ~/Library/Keychains/login.keychain-db");
    expect(message).not.toContain(" -p ");
    expect(message).not.toContain("\n");
  });

  test("denied, missing and unavailable each have distinct one-line guidance", () => {
    const messages = [
      "keychain_access_denied",
      "keychain_item_missing",
      "keychain_unavailable",
    ].map(keychainErrorMessage);
    expect(new Set(messages).size).toBe(messages.length);
    for (const message of messages) {
      expect(message.length).toBeGreaterThan(0);
      expect(message).not.toContain("\n");
    }
  });
});
