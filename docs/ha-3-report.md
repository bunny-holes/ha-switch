# HA-4 보고: HA-3 인터페이스 재설계 구현 완료

작성: 2026-10-13, Claude 세션(wC:p9). 통제 세션: plug-hole(wC:p1). 지시 문서: HA-4.md.

- 브랜치: `wip/ha-3-20261013`
- 구현 커밋: `3e14c72` (Codex 중간본 `0199153` 위에서 마무리)
- 설계 정본: `docs/ha-3-design.md` (16절에 구현 결정 기록 추가)
- `bun run check`: 174 pass, 0 fail, files=70 (format·biome ci·tsc·bun test·바이트 검사 포함)
- 하지 않은 것: 태그, 릴리스, npm publish, 전역 `has` 교체, 실제 로그인·계정 전환 시험, `.zshenv`·실제 `~/.config/ha-switch` 수정

화면 값과 계정 이름은 모두 합성 데이터다.

## 1. 새 도움말 전문 (`has -h`)

```text
HA Switch 0.1.0
Switch saved Codex, Claude Code, and Antigravity profiles on macOS.

Usage:
  has
  has list [TOOL] [--usage] [--json]
  has run TOOL [SELECTOR] [--safe] [--isolated] [-- ARGS...]
  has switch TOOL [SELECTOR]
  has add TOOL NAME
  has restore TOOL

Examples:
  has
  has list codex --usage
  has run codex                    # pick by usage policy, shared home
  has run claude work -- --resume  # named shared-home run
  has run claude work --isolated   # this terminal only
  has switch codex personal
  has switch claude -              # previous selection
  has add codex work
  has restore codex                # first pre-switch login

Commands:
  list       show profiles; --usage refreshes live usage
  run        select, optionally switch, and start a profile
  switch     change the shared native login without starting the tool
  add        run the official login flow and register a new profile
  restore    restore the first safe pre-switch login

Options:
  --pool NAME          use one configured pool
  --config-dir DIR     use another ha-switch config directory
  --usage              refresh account usage (list only)
  --json               print schemaVersion 1 JSON (list/dashboard only)
  --isolated           use source profile; do not change shared login
  --safe               omit pool args and approval-bypass flags
  --color MODE         auto, always, or never (default: auto)
  --no-input           never open a selector
  -h, --help           show this help
  -V, --version        show the version

Selector:
  -                    previous successful shared selection
  2                    row number
  work                 exact name
  wor                  one unique name fragment

Notes:
  has is a fast local/cache dashboard. It never waits for input.
  has run codex uses configured selection policy and live usage.
  run --isolated leaves the shared login alone.
  Prompts run only when stdin and stdout are TTYs.
  NO_COLOR=1 disables color. Secrets are never printed.
  Run has list --usage when you need fresh usage data.
  Maintenance: has init, has import --from DIR (see README).
```

설계 전문과의 차이는 마지막 Notes 한 줄(유지보수 명령 안내)뿐이다. 판 표기는 패키지 실제 값 `0.1.0`이다.

## 2. 목록 화면 예시 (합성 데이터)

대시보드. 상태 파일과 캐시가 있을 때의 모양이며, 단위 시험 `tests/cli.test.ts`의 "dashboard shows recorded shared selection…"이 같은 값을 검증한다.

```text
$ has
HA Switch 0.1.0 · local dashboard

TOOL    #  NAME      SHARED HOME       5H LEFT  5H RESET  7D LEFT  7D RESET  CREDITS  STATUS
codex   1  work      current · 4m ago  74%      in 1h     61%      in 2d     2        fresh · 4m ago
codex   2  personal  —                 0%       in 12m    18%      in 2d     0        limited · 4m ago
claude  1  work      unknown           42%      in 1h     63%      in 2d     ?        stale · 2h ago
claude  2  personal  unknown           18%      in 1h     51%      in 2d     ?        query failed · 18m ago
agy     1  work      unknown           ?        —         ?        —         ?        unknown

Shared home is the last checked native login; isolated sessions are separate.
Run:     has run <tool> <name>
Live:    has list --usage
Switch:  has switch <tool> <name>
```

`has list claude --usage` (한 행 조회 실패 포함, 종료 코드 0):

```text
Claude / default

#  NAME      SHARED HOME         5H LEFT  5H RESET  7D LEFT  7D RESET  CREDITS  STATUS
1  work      —                   42%      in 2h     63%      in 2d     2        fresh · just now
2  personal  current · just now  18%      in 1h     51%      in 2d     1        query failed · 18m ago

SOURCE
1  ~/.claude-work
2  ~/.claude-personal
```

stderr:

```text
has: personal usage query failed (claude_usage_http_429); last value · 18m ago
Next: has run claude personal --isolated --pool default
```

56열 접힘 (Herdr pane에서 `stty cols 56`으로 실측):

```text
Codex / default

#  NAME      HOME  5H  RESET  7D  CR
1  work      ?     ?   —      ?   ?
2  personal  ?     ?   —      ?   ?
  1 work: unknown
  2 personal: unknown
```

JSON 행(`has list --json`) 필드: `tool`, `pool`, `number`, `name`, `source`(절대 경로 또는 null), `current`(true/false/null), `currentCheckedAt`, `authenticated`, `plan`, `status`, `usage.{fiveHourRemaining,fiveHourResetsAt,weeklyRemaining,weeklyResetsAt}`, `resetCredits`, `usageFetchedAt`, `usageAgeSeconds`, `queryError`. 문서 머리는 `schemaVersion: 1`, `command`, `generatedAt`, `accounts`, `warnings`. 오류는 `{"schemaVersion":1,"command":"list","error":{"code","message","next"}}`.

## 3. 옛 → 새 명령 대응표

옛 입력은 아무것도 읽거나 쓰지 않고 종료 코드 2로 `Next:` 한 줄을 낸다.

| 옛 입력 | 새 입력 |
| --- | --- |
| `has x` | `has run codex` |
| `has c` | `has run claude` |
| `has x -s 2`, `has x --account 2` | `has run codex 2` |
| `has -h c` | `has list claude` (`-h`는 언제나 도움말) |
| `has -h c -s 2` | `has switch claude 2` (옛 입력 자체는 도움말로 끝남) |
| `has -s 2`, `has --switch 2`, `has switch 2` | `has switch codex 2` |
| `has -c a personal`, `has save agy personal` | `has add agy personal` |
| `has --list`, `has --list --local`, `has list --local` | `has list` |
| HA-2 source 전용 `has run TOOL NAME` | `has run TOOL NAME --isolated` |
| `has restore` | `has restore codex` |
| `has x --dry-run` | 삭제. `has run TOOL NAME --isolated`로 프로필 시험 |
| `has sync` | 삭제. 전환 전에 저장 로그인을 동기화함 |
| `pool_home_retired` | 제거. 공유는 native 홈, 격리는 source 경로 |

`init`, `import --from DIR`은 유지보수 명령으로 남겼다(도움말 Notes 한 줄, README 설명).

## 4. Herdr 새 셸에서 돌린 결과

임시 패키지(`bun scripts/build.ts`)를 격리된 전역 폴더에 설치하고, 새 pane `wC:pA`에서 합성 `HOME`·`HA_SWITCH_CONFIG_DIR`·가짜 `claude` 실행 파일로 돌렸다. 실제 키체인 쓰기·실제 로그인 교체·실제 본체 실행은 없다. Codex 전환은 합성 `auth.json` 파일만 바꿨다.

| 명령 | 결과 |
| --- | --- |
| `has -h`, `has --version` | 도움말·`0.1.0`, exit 0 |
| `has` (TTY) | 대시보드 한 화면, `unknown` 행, exit 0. 키체인·네트워크 없음 |
| `has list codex` | 표 + SOURCE 블록(`~/.codex-work`), exit 0 |
| `has list --json` | schemaVersion 1 문서, `source` 절대 경로, `current: null` |
| `has x` | `legacy_command` + `Next: has run codex`, exit 2 |
| `has switch codex </dev/null` | `selector_required` + `Next: has switch codex work`, exit 2 |
| `has switch codex personal` | 합성 `~/.codex/auth.json`이 personal로, `codex-accounts/native` 보관, 3줄 안내(`Previous selection: work`), exit 0 |
| `has` (전환 후) | `personal`에 `current · just now`, `work`에 `—` |
| `has run claude work --isolated -- --version` | 가짜 claude가 `CLAUDE_CONFIG_DIR=…/.claude-work`, 인수 `--dangerously-skip-permissions --version`을 받음, 본체 exit 7 그대로 전달 |
| `has run claude --safe -- --version` | `CLAUDE_CONFIG_DIR` 비움, 인수 `--version`만, 키체인 읽기 없음 |
| `has restore codex` | 첫 전환 전 로그인 복원, exit 0 |
| `stty cols 56; has list codex` | 압축 레이아웃으로 접힘, 모든 줄 56열 이내 |
| `has switch codex` (TTY 선택기) → `q` | `cancelled`, exit 130, 쓰기 없음 |
| `has switch codex` → `2` | personal로 전환 |
| `has switch codex o` (모호) → Ctrl-C | 후보 2개 선택기, 취소 exit 130 |

## 5. 직접 확인한 것

- 단위·통합 시험 174개 통과: 가짜 키체인(`listClaudeAccounts` 주입), 임시 HOME의 합성 `auth.json`, 가짜 `codex`/`claude` 바이너리, 임시 설정 폴더만 사용.
- Claude 공유 run 키체인 실패 → `keychain_no_gui_session` + `Next: has run claude work --isolated`, 실행·쓰기 0회 → 같은 fixture에서 `--isolated`가 source로 실행(`tests/profile-launch.test.ts`).
- 두 isolated run 동시 실행 시 `CODEX_HOME`/`CLAUDE_CONFIG_DIR`가 분리되고 공유 `auth.json`·백업·`state.json`이 생기지 않음(실제 프로세스 spawn 시험).
- `run codex` 자동 선택: live usage 조회 → 정책 선택 → prepare·switch·verify → state 기록 → 승인 생략 플래그+풀 args+전달 인수 순서. 전부 실패 시 `selection_usage_unavailable`, 후보 없음 시 `no_available_account`로 전환·실행 0회(`tests/native-cli.test.ts`, 회귀 fixture는 실제 파일과 가짜 app-server).
- `--safe`가 풀 args와 승인 플래그를 모두 빼고 `--` 뒤 인수는 유지.
- 0/unknown/stale/query failed/limited/signed out 구분, 5H·7D reset 시각과 CREDITS 분리, 캐시 stale(1시간 또는 초기화 시각 경과) 규칙.
- NO_COLOR·`--color`·TTY 우선순위, JSON 무색, 112열 전폭·56열 접힘.
- `add`: 로그인 전 이름·source 충돌 거부, 실패·취소(130) 시 설정 불변, Claude `auth status --json` 메모리 검증(`loggedIn`, `claude.ai`, `configDirectory`), preflight 뒤 설정 변경 시 `config_changed`.
- Claude 백업이 첫 전환에만 쓰이고 두 번째 전환이 덮어쓰지 않음(`tests/claude-accounts.test.ts`).
- 패키지 시험: 임시 tarball 설치본이 소스·상태 없이 동작하고 README 두 개·LICENSE·실행 파일만 포함.
- `source ~/.zshenv`는 건드리지 않았다(파일 미수정).

## 6. 확인하지 못한 것

- 실제 계정으로의 로그인 교체·전환·복원, 실제 Claude 키체인 쓰기, 실제 `codex login`/`claude auth login` 흐름. 모두 지시대로 시험하지 않았다.
- 실제 Codex app-server·Claude usage 엔드포인트 응답. 가짜 app-server와 고정 응답만 사용했다.
- `claude auth status --json`의 `configDirectory` 필드는 공식 문서상 Claude Code 2.1.268 이상에서만 나온다. 빈 임시 폴더로 현재 설치본이 그 필드를 내는 것은 확인했다. 더 오래된 본체에서는 `add claude`가 `add_login_unverified`로 끝난다.
- Antigravity 실제 keyring. 가짜 어댑터로만 검증했고 `run agy --isolated`는 설계대로 거부한다.
- Esc 단독 키로 선택기 취소. readline 줄 입력에서 구분할 수 없어 `q`·빈 Enter·Ctrl-C·Ctrl-D만 취소로 처리한다(설계 16절 기록).
- 시험 중 한 번 합성 HOME으로 `has run claude personal`(공유)을 돌려 어댑터가 실제 로그인 키체인 항목을 **읽기만** 했다. 쓰기와 실행은 검증 단계에서 `account_not_signed_in`으로 막혀 0회였다. 이후 smoke에서는 공유 Claude 전환을 돌리지 않았다.

## 7. 남은 일과 결정 요청

- 태그·릴리스·npm publish·전역 `has` 교체: 오너 결정 대기.
- `main`으로의 병합 여부와 판 번호(`0.2.0`) 결정.
- 실제 계정으로 `has add`·`has run`을 한 번 돌려 볼지는 오너가 일반 Mac Terminal에서 직접 하는 것을 권한다.
