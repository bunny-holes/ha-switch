import { PoolError } from "./errors.ts";

const known = new Set([
  "keychain_interaction_not_allowed",
  "keychain_access_denied",
  "keychain_item_missing",
  "keychain_unavailable",
  "keychain_read_failed",
  "keychain_write_failed",
]);

export function keychainFailure(error: unknown, operation: "read" | "write" = "read"): PoolError {
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
  )
    return new PoolError("keychain_interaction_not_allowed");
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
    case "keychain_interaction_not_allowed":
      return "키체인이 잠겼거나 원격 세션에서 접근을 허용하지 않습니다. Mac에서 security unlock-keychain ~/Library/Keychains/login.keychain-db 를 실행하세요. 암호는 프롬프트에 입력하고, 계속 실패하면 Mac 화면에서 키체인 접근을 허용하세요.";
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
