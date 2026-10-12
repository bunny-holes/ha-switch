import { PoolError } from "./errors.ts";
import type { KeychainContext } from "./keychain-context.ts";

const known = new Set([
  "keychain_interaction_not_allowed",
  "keychain_locked",
  "keychain_no_gui_session",
  "keychain_access_denied",
  "keychain_item_missing",
  "keychain_unavailable",
  "keychain_read_failed",
  "keychain_write_failed",
]);

export function keychainFailure(
  error: unknown,
  operation: "read" | "write" = "read",
  context: KeychainContext = {},
): PoolError {
  if (error instanceof PoolError && known.has(error.code)) return error;
  const value =
    error !== null && typeof error === "object" ? (error as Record<string, unknown>) : {};
  const codes = [value.code, value.errno, value.status];
  const matches = (expected: readonly (string | number)[]) =>
    codes.some((code) => expected.some((candidate) => code === candidate));
  if (
    matches([
      "ERR_SECRETS_INTERACTION_NOT_ALLOWED",
      "ERR_SECRETS_INTERACTION_REQUIRED",
      -25308,
      -25315,
    ])
  ) {
    if (context.unlocked === false) return new PoolError("keychain_locked");
    if (context.hasGraphicAccess === false) return new PoolError("keychain_no_gui_session");
    return new PoolError("keychain_interaction_not_allowed");
  }
  if (
    matches([
      "ERR_SECRETS_AUTH_FAILED",
      "ERR_SECRETS_ACCESS_DENIED",
      "ERR_SECRETS_USER_CANCELED",
      -25293,
      -128,
    ])
  )
    return new PoolError("keychain_access_denied");
  if (matches(["ERR_SECRETS_NOT_FOUND", "ERR_SECRETS_ITEM_NOT_FOUND", -25300]))
    return new PoolError("keychain_item_missing");
  if (matches(["ERR_SECRETS_NOT_AVAILABLE", -25291])) return new PoolError("keychain_unavailable");
  return new PoolError(`keychain_${operation}_failed`);
}

export function keychainErrorMessage(code: string): string {
  switch (code) {
    case "keychain_locked":
      return "로그인 키체인이 잠겨 있습니다. security unlock-keychain ~/Library/Keychains/login.keychain-db 를 실행하고 암호는 프롬프트에 입력하세요.";
    case "keychain_no_gui_session":
      return "현재 실행 세션은 macOS 승인 창을 띄울 수 없습니다. 일반 Mac Terminal에서 명령을 실행하세요. 원격에서 시작한 Herdr 서버는 로컬에서 붙어도 같은 보안 세션을 유지할 수 있습니다.";
    case "keychain_interaction_not_allowed":
      return "macOS가 키체인 접근에 필요한 확인을 허용하지 않습니다. 일반 Mac Terminal에서 실행하고 항목의 앱 접근 권한을 확인하세요. 실제 잠금 상태일 때만 security unlock-keychain ~/Library/Keychains/login.keychain-db 를 실행하세요.";
    case "keychain_access_denied":
      return "키체인 접근이 거부됐습니다. Mac 화면의 키체인 접근 앱에서 접근 권한을 확인하세요.";
    case "keychain_item_missing":
      return "저장된 로그인 항목이 없습니다. 해당 앱에서 로그인하세요.";
    case "keychain_unavailable":
      return "키체인 서비스를 사용할 수 없습니다. Mac의 로그인 키체인을 확인하세요.";
    case "keychain_read_failed":
      return "키체인을 읽지 못했습니다. Mac 화면에서 로그인 키체인을 확인하세요.";
    case "keychain_write_failed":
      return "키체인에 저장하지 못했습니다. Mac 화면에서 로그인 키체인을 확인하세요.";
    default:
      return code;
  }
}

export function isKeychainFailure(error: unknown): error is PoolError {
  return error instanceof PoolError && known.has(error.code);
}
