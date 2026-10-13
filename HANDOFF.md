# HA Switch 이관 인계 — 2026-10-12

## 다음 한 걸음

able-tei에서 이 저장소의 `main`을 받아 `AGENTS.md`와 이 파일을 읽는다.
오너가 작업을 재개하면 `bun install`, `bun run check`로 새 머신의 상태를 확인한다.
현재 지시는 인계 커밋과 push까지만이다. 새 구현·설치·릴리스는 시작하지 않는다.
이 파일은 이제 추적하고 커밋한다. 과거의 미추적·중단 인계 지시는 이 지시로 대체됐다.

## 막힌 것

현재 저장소 작업의 기술적 막힘은 없다. 구현·검사·push·CI 확인을 마쳤다.
런타임은 macOS와 Bun 1.4.2 이상이 필요하다. able-tei의 OS와 keychain 사용 가능 여부는 확인하지 않았다.
다른 OS에서 실제 계정 전환이 된다고 가정하지 않는다.
같은 홈을 쓰는 Codex의 외부 토큰 쓰기는 HA Switch가 완전히 막을 수 없다.
오너는 실행 홈을 교체 자리로 사용하는 동작을 의도했고, 전환·시작을 동시에 하지 않도록 스킬에 명시하라고 했다.
새 세션이 선택한 로그인을 읽고 시작한 뒤 다음 터미널을 연다. 기존 세션을 닫을 필요는 없다.

## 필요한 비밀 파일 이름 — 값은 저장하지 않음

- 저장소 `.secret`은 현재 개발·합성 시험에 필요하지 않다. 비밀 파일은 Git으로 이관하지 않는다.
- 실제 Codex 사용에는 `~/.codex/auth.json`, `~/.codex-pkl1/auth.json`, `~/.codex-pkl2/auth.json`이 필요하다.
- 첫 전환 후 1번 원본은 `~/.config/ha-switch/codex-accounts/native/auth.json`에 따로 보관된다. 기존 파일이 있으면 로그인 원본으로 취급한다.
- 전환 백업은 `~/.codex/auth.json.ha-switch-backup`이다.
- Claude·Antigravity의 저장 로그인은 macOS keychain에 있다. 파일이나 Git에 비밀 값을 내보내지 않는다.
- 설정 파일 `~/.config/ha-switch/codex-pools.json`은 별도 머신 설정이다. 로그인 파일과 keychain은 보안 경로로 이관하거나 다시 로그인한다.

## 저장소와 완료 상태

- 원격: `https://github.com/bunny-holes/ha-switch.git`
- 브랜치: `main`
- 이관 문서 작성 전 구현 HEAD: `c2c83d3f9f0aaddf9ba5460fe26792e7cd93297f`
- 구현 커밋: `63cee11`, `06cb8e1`, `faf3039`, `c2c83d3`. 모두 main에 push했다.
- `bun run format`과 `lockf -k /tmp/xiyo-heavy.lock bun run check` 통과: 137 pass, 0 fail, 906 assertions.
- 구현 HEAD CI 성공: `https://github.com/bunny-holes/ha-switch/actions/runs/38153437929`
- 전역 실행 파일은 로컬 빌드로 교체했고 패키지 5개 파일의 정확한 일치를 확인했다.
- 설치 전후 합성 CLI 시험에서 기본 홈 전환·자동 선택·실행 거부·다른 풀의 목록/전환/resume 호환을 확인했다.
- 실제 로그인 전환이나 실제 모델 세션을 시험으로 실행하지 않았다.
- 실제 목록의 읽기 전용 확인에서 현재 기본 홈은 `* 1`로 표시됐다.
- 태그·릴리스·npm publish는 하지 않았다.

## 최신 동작과 오너 결정

- `has switch codex N`, `has switch N`, `has x --account N`, `has x -s N`은 기본 `~/.codex`에 선택 로그인을 적용한다.
- 1·2·3번 원본과 교체 자리 0번을 분리한다. 원래 `.codex` 로그인은 첫 전환 전 별도 원본으로 보관한다.
- 전환 전에 같은 계정의 갱신된 토큰을 원본에 동기화한다. 변경된 파일 및 섞인 계정/토큰은 거부하고 실행 직전 선택 계정을 확인한다.
- `has x`에 번호가 없으면 2·3번 중 5시간 잔량 10% 이상인 계정을 고른다. 큰 5시간 잔량, 주간 잔량, 설정 순서로 결정한다.
- 둘 다 부족하면 1번을 사용한다. 1번은 주간 잔량이 20%보다 커야 한다. 없으면 `no_available_account`와 “사용 가능한 계정 없음”, 종료 코드 1로 끝내고 전환·실행하지 않는다.
- 필수 잔량 미확인 및 조회 실패는 선택 후보에서 뺀다. 번호를 명시하면 자동 사용량 선택을 생략한다.
- 풀의 `selection` 설정: `priority`, `minimumFiveHourRemaining`, `fallback`, `minimumFallbackWeeklyRemaining`.
- 표와 선택 규칙은 `src/usage-state.ts`의 같은 잔량·제한 기준을 쓴다.
- `has c`는 기본 `.claude`에서 실행한다. 별도 풀 홈과 기본 홈의 백업을 분리했고 `has restore c`로 기본 Claude 홈을 복원한다.
- 단축 실행은 네이티브 최대 허용 옵션을 중복 없이 넣는다. `--safe`로 관리 옵션을 뺀다. `--dry-run`은 로그인 읽기·쓰기를 하지 않는다.
- 설정·플러그인·MCP·세션은 자동 복사하지 않는다. `.zshenv`는 범위 밖이다.
- 저장소 스킬 `skills/has/SKILL.md`에 전환·시작 동시 실행과 병렬 위임 금지를 명시했다.

## 이 Mac의 설정 변경과 폐기 홈

오너가 `.codex-pkls` 홈과 그 홈의 app-server 두 개를 삭제·종료했다고 알렸다.
이 세션에서는 삭제를 다시 하지 않았다.
구현·검사 결과를 보고한 뒤 실제 `codex-pools.json`의 `pkls.home`만 `.codex`으로 바꿨다.
계정 목록 `[".codex", ".codex-pkl1", ".codex-pkl2"]`와 다른 설정은 유지하고 변경을 검증했다.
`pkls`는 이제 풀 이름이며 별도 실행 홈을 뜻하지 않는다.
옛 `.codex-pkls`를 대상으로 하는 호환 실행·전환·동기화·복원은 `pool_home_retired`로 거부하며 홈을 새로 만들지 않는다.

## 설치 주의와 검증 경로

이 Mac의 Bun 전역 lock에 중복 HA Switch 항목이 있었고, 같은 0.1.0 버전의 옛 로컬 패키지를 계속 골랐다.
일반 설치·강제 설치 메시지를 성공 증거로 쓰지 않았다. 마지막에는 로컬 패키지 5개 파일을 교체하고 전역 HA Switch 해석 항목만 맞췄다.
전역 강제 설치 시 Bun이 다른 기존 전역 패키지도 다시 설치했다. 해당 명령을 새 머신에서 무조건 반복하지 않는다.
able-tei에는 이 Mac의 `/tmp` 산출물이나 전역 설치가 있다고 가정하지 않는다.

- 빌드: `bun scripts/build.ts /tmp/ha-switch-local.tgz`
- 패키지 경계: 실행 파일, package.json, README 두 언어, LICENSE만 포함한다.
- 기본 홈 합성 CLI 확인: `bun tests/fixtures/native-regression.ts EXECUTABLE`
- 다른 풀의 호환 확인: `bun tests/fixtures/legacy-regression.ts EXECUTABLE`
- 합성 시험은 임시 홈·가짜 keychain·가짜 Codex만 사용한다.
- 실제 계정으로 모델 요청을 보내 사용량을 확인하지 않는다. 사용량은 native app-server의 `account/rateLimits/read`를 쓴다.

## 소스 읽기 순서

1. `AGENTS.md`, 이 파일, `git status --short`.
2. `src/cli.ts`, `src/selection.ts`, `src/usage-state.ts`, `src/launch.ts`.
3. `src/pool.ts`, `src/profiles.ts`, `src/claude-accounts.ts`.
4. `tests/native-cli.test.ts`, `tests/native-codex.test.ts`, `tests/selection.test.ts`, `tests/fixtures/native-regression.ts`.
5. README 두 언어, `skills/has/SKILL.md`, `skills/has/skill.json`.

## 이관 범위

모든 저장소 변경을 의미 단위로 커밋하고 이 파일도 추적한다.
`.gitignore`는 `.secret`, `dist/`, `*.tgz`, `node_modules/`, `.claude/`를 제외한다.
로그인 파일·비밀·빌드 산출물은 커밋하지 않는다. 필요한 비밀 값은 이 문서에 없다.
이관 push 뒤에는 새 작업을 시작하지 않는다.
