<div align="center">

<img src="https://raw.githubusercontent.com/bunny-holes/ha-switch/main/assets/ha-switch.svg" width="112" height="112" alt="HA Switch 로고: 화살표로 이어진 계정 카드 두 개">

# HA Switch

**명령 하나로 코딩 계정을 바꾼다.**

Codex · Claude Code · Antigravity CLI

[![릴리스](https://img.shields.io/github/v/release/bunny-holes/ha-switch?style=flat-square&color=65dbc9)](https://github.com/bunny-holes/ha-switch/releases/latest)
[![검사](https://github.com/bunny-holes/ha-switch/actions/workflows/check.yml/badge.svg)](https://github.com/bunny-holes/ha-switch/actions/workflows/check.yml)
![macOS](https://img.shields.io/badge/macOS-only-172438?style=flat-square&logo=apple&logoColor=white)
![Bun](https://img.shields.io/badge/Bun-%E2%89%A51.4.2-ffb083?style=flat-square&logo=bun&logoColor=172438)
[![라이선스](https://img.shields.io/badge/license-MIT-65dbc9?style=flat-square)](LICENSE)

[English](README.md) · [한국어](README.ko.md) · [다운로드](https://github.com/bunny-holes/ha-switch/releases/latest)

</div>

저장한 계정과 남은 사용량을 한눈에 보고, 명령 하나로 알맞은 계정을 연다.
설정·플러그인·MCP 인증·대화 기록은 그대로 둔다.
HA는 Harness Account의 줄임말이다.

| 도구 | `TOOL` | 공유 홈 전환 | 격리 실행 | `has` 사용량 조회 |
| --- | --- | --- | --- | --- |
| 🤖 Codex | `codex` 또는 `x` | ✅ | ✅ | ✅ |
| ✳️ Claude Code | `claude` 또는 `c` | ✅ | ✅ | ✅ |
| 🚀 Antigravity CLI | `agy` 또는 `a` | ✅ | 공식 문서 없음 | 아직 없음 |

> [!NOTE]
> `has add codex NAME`과 `has add claude NAME`은 새 프로필을 위한 공식 로그인을 연다.
> `has add agy NAME`은 `agy`로 이미 로그인한 Antigravity 계정을 저장한다.

## 📦 CLI 설치

GitHub Releases에서 CLI 패키지와 에이전트 스킬을 따로 받는다.
Bun 1.4.2 이상을 설치하고 릴리스 주소로 CLI를 설치한다.[^bun-add]

```bash
bun add --global --ignore-scripts https://github.com/bunny-holes/ha-switch/releases/download/v0.2.0/ha-switch-0.2.0.tgz
export PATH="$(bun pm bin --global):$PATH"
has -h
has --version
```

실행 명령은 `has`다. 패키지 이름은 `@bunny-holes/ha-switch`를 유지한다.
쓸 도구의 앱 명령인 `codex`, `claude`, `agy`도 필요하다.

## ⚡ 명령 다섯 개

```text
has
has list [TOOL] [--usage] [--json]
has run TOOL [SELECTOR] [--safe] [--isolated] [-- ARGS...]
has switch TOOL [SELECTOR]
has add TOOL NAME
has restore TOOL
```

| 하고 싶은 일 | 입력 |
| --- | --- |
| 모든 계정과 마지막 사용량 훑기 | `has` |
| 잔량이 가장 많은 계정으로 `~/.codex`에서 Codex 열기 | `has run codex` |
| `~/.claude`에 로그인된 그대로 Claude 열기 | `has run claude` |
| 이름을 골라 공유 홈에서 열기 | `has run claude work -- --resume` |
| 다른 계정을 이 터미널에서만 나란히 열기 | `has run claude work --isolated` |
| 아무것도 열지 않고 공유 로그인만 바꾸기 | `has switch codex personal` |
| 직전 선택으로 돌아가기 | `has switch codex -` |
| 지금 사용량 갱신 | `has list --usage` |
| 새 계정 등록 | `has add codex work` |
| 첫 전환 전 로그인 되돌리기 | `has restore codex` |

`-h`와 `--help`는 언제나 도움말이다. 릴리스 전에는 이 저장소에서 `has` 대신
`bun src/bin.ts`를 쓴다.

### 대시보드: `has`

인자 없는 `has`는 한 화면을 내고 끝난다. 설정, 마지막으로 기록한 공유 선택,
마지막 사용량 캐시만 읽는다. 키체인과 네트워크를 읽지 않고 입력을 기다리지 않는다.

```text
$ has
HA Switch 0.2.0 · local dashboard

TOOL    #  NAME      SHARED HOME       5H LEFT  5H RESET  7D LEFT  7D RESET  CREDITS  STATUS
codex   1  work      current · 4m ago  74%      in 1h     61%      in 2d     2        fresh · 4m ago
codex   2  personal  —                 0%       in 12m    18%      in 2d     0        limited · 4m ago
claude  1  work      unknown           42%      in 2h     ?        —         ?        stale · 2h ago
agy     1  personal  unknown           ?        —         ?        —         ?        unknown

Shared home is the last checked native login; isolated sessions are separate.
Run:     has run <tool> <name>
Live:    has list --usage
Switch:  has switch <tool> <name>
```

`SHARED HOME`은 도구의 기본 홈(`~/.codex`, `~/.claude`, Antigravity 키링)에서 마지막으로
확인한 계정이다. `current`에는 확인 시각이 붙고, `—`는 확인 결과 다른 계정이었다는 뜻,
`unknown`은 아직 확인한 적이 없다는 뜻이다. 다른 앱이 바꾼 로그인은 다음
`has list --usage`, `has switch`, 공유 `has run` 때 알게 된다.

`0%`와 `0`은 실제 값이고 `?`는 모르는 값이다. `STATUS`는 `fresh`, `stale`(한 시간이
지났거나 초기화 시각이 지남), `limited`, `query failed`, `signed out`, `unknown`을
구분한다. 조회가 실패해도 마지막 정상 값과 그 나이를 남긴다.

### 목록과 실시간 사용량: `has list`

`has list`는 같은 로컬 데이터를 도구별 표와 `SOURCE` 블록으로 보여 준다. `--usage`를
붙이면 도구마다 조회한다. Codex는 app-server의 `account/rateLimits/read`(모델 요청은
하지 않음), Claude는 사용량 엔드포인트, Antigravity는 로그인 상태만 본다. 한 행이
실패해도 나머지는 그대로 나오고 종료 코드는 0이다. stderr에 실패 행마다 한 줄과
`Next:` 명령을 쓴다.

```text
$ has list claude --usage
Claude / default

#  NAME      SHARED HOME         5H LEFT  5H RESET  7D LEFT  7D RESET  CREDITS  STATUS
1  work      current · just now  42%      in 2h     63%      in 3d     1        fresh · just now
2  personal  —                   18%      in 1h     51%      in 3d     ?        query failed · 18m ago

SOURCE
1  ~/.config/ha-switch/profiles/claude/work
2  ~/.claude-sample
```

좁은 창에서는 표를 접는다. `SOURCE` 블록을 먼저 빼고, 다음은 `7D RESET`, 마지막으로
`#`, `NAME`, `HOME`, `5H`, `RESET`, `7D`, `CR`만 남기고 상태는 표 아래에 쓴다. 긴 이름은
`…`으로 줄인다.

### 도구 열기: `has run`

| 입력 | 동작 | 실행 홈 |
| --- | --- | --- |
| `has run codex` | 실시간 사용량과 풀의 `selection` 정책으로 계정을 고르고, 공유 로그인을 안전하게 바꾼 뒤 Codex를 연다 | `~/.codex` |
| `has run codex work` | 이름을 검증하고 공유 로그인을 바꾼 뒤 연다. 사용량 조회는 없다 | `~/.codex` |
| `has run claude` | 공유 홈에 이미 있는 로그인으로 Claude를 연다. 키체인을 읽지 않는다 | `~/.claude` |
| `has run claude work` | 공유 로그인을 바꾼 뒤 Claude를 연다 | `~/.claude` |
| `has run TOOL work --isolated` | 계정의 원본 폴더로 도구를 연다. 공유 로그인은 손대지 않는다 | 설정된 원본 |
| `has run agy [NAME]` | 이름이 있으면 Antigravity 키링을 바꾼 뒤 `agy`를 연다 | 기본 키링 |

진행 안내는 stderr로 나가고, 도구의 stdout과 종료 코드는 그대로 전달된다.

```text
$ has run codex
Selecting Codex account by usage policy...
Codex: using work (74% left, resets in 1h).
Starting Codex in shared home...
```

모든 run은 풀의 `args`와 아래 승인 생략 옵션을 한 번씩 붙이고, 그 뒤에 `--` 다음
인수를 둔다.

| 도구 | 붙이는 옵션 |
| --- | --- |
| Codex | `--dangerously-bypass-approvals-and-sandbox`(기존 `--yolo`도 같은 뜻), `--dangerously-bypass-hook-trust` |
| Claude | `--dangerously-skip-permissions` |

`--safe`는 풀 `args`와 위 옵션을 빼고 도구 자체의 권한 설정을 따른다. `--` 뒤 인수는
언제나 적힌 그대로 넘긴다.

`--isolated` 실행은 `CODEX_HOME` 또는 `CLAUDE_CONFIG_DIR`을 쓴다. 공유 홈의 설정·기록·
플러그인을 복사하지 않으며 여러 개를 나란히 열 수 있다. Antigravity는 문서화된 격리
로그인이 없어 `run agy --isolated`를 거부한다.

이름을 지정한 공유 Claude 실행이 키체인을 읽지 못하면(예: 그래픽 보안 세션이 없는
pane) `has`는 아무것도 쓰거나 열지 않고 격리 실행 대안을 알려 준다.

```text
$ has run claude work
has: keychain_no_gui_session — 현재 실행 세션은 macOS 승인 창을 띄울 수 없습니다. …
Next: has run claude work --isolated
```

### 공유 로그인 바꾸기: `has switch`와 `has restore`

```text
$ has switch codex work
Codex: switched the shared home to work.
Open Codex sessions keep their current login.
Previous selection: personal. To go back: has switch codex -

$ has restore codex
Codex: restored the first pre-switch login.
Next: has
```

`switch TOOL -`는 직전에 성공한 공유 선택으로 돌아간다. `restore TOOL`은 `has`가 처음
바꾸기 전에 공유 홈이 갖고 있던 로그인으로 돌아간다. 둘은 다르다. 백업은 한 번만
쓰고 그 뒤 전환은 덮어쓰지 않는다. 이미 로그인을 읽은 프로세스는 다시 시작할 때까지
그 로그인을 유지한다.

전환 전마다 `has`는 갱신된 토큰을 원본에 돌려쓰고, 계정이 섞인 상태를 거부하고, 쓰기
직전 대상을 다시 읽고, 파일을 원자적으로 교체한다. 공유 전환은 한 번에 하나씩, 토큰
갱신 중에는 하지 않는다.

### 선택자

| 선택자 | 뜻 |
| --- | --- |
| `-` | 직전에 성공한 공유 선택 |
| `2` | `has`와 `has list`에 보이는 행 번호. 풀마다 1부터 |
| `work` | 정확한 이름. 대소문자 무시 |
| `wor` | 이름 하나에만 들어맞는 조각 |

후보가 여럿이면 stdin과 stdout이 모두 터미널일 때 번호 선택기를 연다. Enter는 확정,
`q`·Ctrl-C·Ctrl-D는 취소이며 종료 코드 130으로 아무것도 바꾸지 않는다. 파이프, CI,
`--no-input`, `--json`에서는 `selector_required` 또는 `account_selector_ambiguous`로
멈추고 후보를 적어 준다.

### 계정 등록: `has add`

```text
$ has add codex work
Opening official Codex login for work...
<official login flow>
Codex: signed in and saved as work.
Run: has run codex work
```

Codex는 `codex login`, Claude는 `claude auth login`을 새 원본 폴더
`~/.config/ha-switch/profiles/<tool>/<name>`에서 실행한다. 로그인을 확인한 뒤에만
등록한다. Codex는 새 `auth.json`의 계정으로, Claude는 `claude auth status --json`이
`loggedIn`, `claude.ai` 방식, 같은 `configDirectory`(Claude Code 2.1.268 이상)를
보고하는지로 확인한다. 상태 출력은 메모리에서만 검사하고 화면에 내지 않는다. 이미 쓰는
이름이나 이미 있는 원본 폴더는 로그인 전에 거부한다. 취소하거나 실패하면 설정은 그대로
두고 폴더는 재시도를 위해 남긴다.

`has add agy NAME`은 `agy`가 지금 로그인한 Antigravity 계정을 저장한다. 새 로그인을
시작하지 않는다.

### 옵션, 종료 코드, JSON

| 옵션 | 적용 |
| --- | --- |
| `--pool NAME` | 한 도구에 풀이 여럿일 때 하나를 고른다 |
| `--config-dir DIR` | 다른 설정 폴더를 쓴다 |
| `--usage` | `list`에서만. 실시간 사용량 조회 |
| `--json` | `has`와 `list`에서만. stdout에 schemaVersion 1 문서 하나 |
| `--isolated`, `--safe` | `run`에서만 |
| `--color auto\|always\|never` | 기본 `auto`: 터미널이고 `NO_COLOR`가 비었을 때만 색. `--color always`는 `NO_COLOR`보다 우선 |
| `--no-input` | 선택기를 열지 않는다 |
| `-h`, `--help`, `-V`, `--version` | 도움말과 판 |

| 종료 코드 | 뜻 |
| --- | --- |
| 0 | 성공. 일부 사용량 조회가 실패한 목록 포함 |
| 1 | 작업 실패: 설정, 로그인, 기본 파일, 키체인 |
| 2 | 잘못된 명령·옵션·선택자, 모호한 선택, 터미널 밖에서 선택자 누락, 퇴역 명령 |
| 130 | 선택기나 로그인 취소 |

오류는 stderr에 `has: CODE — 원인`과 `Next:` 명령으로 나온다. 알 수 없는 예외의 메시지는
내지 않는다. 안전한 진단은 `LOG_LEVEL=debug`로 본다.

`--json` 행에는 `tool`, `pool`, `number`, `name`, `source`(절대 경로 또는 `null`),
`current`(`true`, `false`, 확인 전이면 `null`), `currentCheckedAt`, `authenticated`,
`plan`, `status`, ISO 초기화 시각이 든 `usage`, `resetCredits`, `usageFetchedAt`,
`usageAgeSeconds`, `queryError`가 있다. 오류도 문서 하나다:
`{"schemaVersion":1,"command":"list","error":{"code","message","next"}}`. 토큰, 계정
ID, 이메일, 원시 응답은 넣지 않는다.

## 🔄 옛 명령에서 옮기기

옛 최상위 단축과 옵션은 종료 코드 2로 멈추고 새 명령을 알려 준다. 아무것도 읽거나
쓰지 않는다.

| 옛 입력 | 새 입력 |
| --- | --- |
| `has x` | `has run codex` |
| `has c` | `has run claude` |
| `has x -s 2`, `has x --account 2` | `has run codex 2` |
| `has -h c` | `has list claude` (`-h`만 쓰면 도움말) |
| `has -h c -s 2` | `has switch claude 2` |
| `has -s 2`, `has switch 2` | `has switch codex 2` |
| `has -c a personal`, `has save agy personal` | `has add agy personal` |
| `has --list`, `has --list --local` | `has list` |
| `has run TOOL NAME`(원본 전용) | `has run TOOL NAME --isolated` |
| `has restore` | `has restore codex` |
| `has x --dry-run`, `has sync` | 삭제. 프로필 시험은 `--isolated`로, 저장 로그인 동기화는 전환 때 수행 |

기존 `~/.config/ha-switch/*-pools.json`은 그대로 읽는다. 폴더 이름인 label, `from`
경로, `args`, `selection` 정책 모두 전과 같다. 공유 홈은 언제나 도구의 기본 홈이다.
풀의 `home`이 `.codex`나 `.claude`가 아니면 전환 전 백업을 따로 둔다는 뜻만 남는다.
폐기된 `.codex-pkls` 홈은 더 이상 어떤 명령도 막지 않는다.

셸 별칭은 제안일 뿐이며 `has`는 `~/.zshenv`를 고치지 않는다.

```zsh
alias codex-auto='has run codex'
alias claude-current='has run claude'
alias claude-work='has run claude work --isolated --'
```

### Codex 자동 선택

선택자 없는 `has run codex`는 저장한 계정마다 실시간 사용량을 조회한 뒤 풀의
`selection` 정책을 적용한다. 5시간 최소 잔량을 넘긴 우선 계정 중 5시간 잔량이 큰
쪽, 그다음 주간 잔량으로 고른다. 없으면 대체 계정의 주간 잔량이 하한을 넘어야 한다.
실패한 조회와 모르는 값은 후보가 아니다. 모든 조회가 실패하면
`selection_usage_unavailable`, 조건을 만족한 계정이 없으면 `no_available_account`로
멈춘다. 두 경우 모두 전환도 실행도 하지 않는다.

```json
{
  "priority": [2, 3],
  "minimumFiveHourRemaining": 10,
  "fallback": 1,
  "minimumFallbackWeeklyRemaining": 20
}
```

## 🧩 에이전트 스킬 설치

`has` 스킬은 설치된 CLI를 쓴다. 마켓플레이스나 MCP 서버 없이 설치할 수 있다.
Codex는 `~/.agents/skills/`에 설치하고 `$has`로 부른다.[^codex-skills]
Claude Code는 대신 `~/.claude/skills/`에 설치하고 `/has`로 부른다.[^claude-skills]

```bash
has_skill_archive="$(mktemp -d)/has-skill-0.2.0.tgz"
curl -fL https://github.com/bunny-holes/ha-switch/releases/download/v0.2.0/has-skill-0.2.0.tgz -o "$has_skill_archive"
mkdir -p "$HOME/.agents/skills"
test ! -e "$HOME/.agents/skills/has" && tar -xzf "$has_skill_archive" -C "$HOME/.agents/skills"
```

마지막 명령은 기존 `has` 스킬을 덮어쓰지 않는다. CLI 설치와 스킬 설치는 별개다.

## 🏁 처음 쓰기

공식 로그인으로 계정을 하나씩 등록한다.

```bash
has add codex work
has add claude work
has
```

홈에 이미 Codex·Claude 프로필 폴더가 있으면 `has init`이 전환 없이 설정을 만들고,
`has import --from DIRECTORY`는 옛 위치의 풀 파일을 복사한다. 둘 다 일상 도움말 밖의
유지보수 명령이다. `init`은 풀 `home`에 `.codex-ha-switch`를 적지만 공유 전환은
언제나 `~/.codex`를 대상으로 한다.

첫 기본 홈 Codex 전환 전에 `~/.codex`에 있던 로그인은
`~/.config/ha-switch/codex-accounts/native/auth.json`에 보관하고, 기본 홈의 백업은
`~/.codex/auth.json.ha-switch-backup`이다. Claude의 저장 계정과 전환 전 백업은 macOS
키체인에 둔다.

Antigravity는 로그인한 상태에서 `has add agy personal`로 한 번 저장하고, `agy`로 다음
계정에 로그인한 뒤 또 저장한다.

## ⚙️ 설정

기본 위치는 `~/.config/ha-switch/`다. `HA_SWITCH_CONFIG_DIR`나 `--config-dir`로 다른
위치를 쓴다. 행 번호는 각 풀 안의 계정 순서다. 같은 폴더에 `state.json`(마지막 공유
선택과 확인 시각)과 `usage-cache.json`(마지막 사용량, 초기화 시각, 안전한 오류 코드)도
둔다. 두 파일에 토큰은 없다.

<details>
<summary>설정 파일 예시</summary>

`codex-pools.json`:

```json
{
  "default": {
    "home": ".codex",
    "accounts": ["work", "personal"],
    "from": { "work": ".codex-work", "personal": ".codex-personal" },
    "args": ["-c", "model_reasoning_effort=medium"]
  }
}
```

`claude-pools.json`:

```json
{
  "default": {
    "home": ".claude",
    "accounts": ["personal", "work"],
    "from": { "personal": ".claude-personal", "work": ".claude-work" }
  }
}
```

경로는 홈 폴더를 기준으로 읽는다. 절대경로도 쓸 수 있다.
설정 파일에는 경로와 계정 이름만 두고 인증 토큰은 넣지 않는다.
`agy-pools.json`은 `has add agy NAME`이 만들고 `accounts`에 저장한 이름이 들어간다.

</details>

## 🔐 데이터와 제한

Codex는 `auth.json` 로그인 데이터를 원본 폴더와 공유 홈 사이에서 복사하고, 설치된
app-server로 사용량을 조회한다. Claude와 Antigravity는 앱이 쓰는 macOS 키체인 형식을
따른다. 저장한 로그인과 백업도 키체인에 둔다. 별도 암호화 보관소를 만들지 않는다.
프로필 폴더를 교체하지 않는다. 실행 중인 앱은 이미 읽은 로그인을 계속 쓸 수 있고,
바꾼 계정은 다음 실행에 적용된다.

Antigravity CLI의 사용량은 아직 조회하지 않는다. Antigravity IDE 전환과 Gemini CLI는
대상이 아니다. Claude Console 프로필, 클라우드 인증, 키링만 쓰는 Codex 로그인은 이번
판에서 다루지 않는다. Windows와 Linux 어댑터는 별도 검증이 필요하다.

인증 어댑터는 [Codex app-server 문서](https://learn.chatgpt.com/docs/app-server)와
[Claude Code 인증 문서](https://code.claude.com/docs/en/authentication)의 형식을 따른다.
Antigravity의 저장 방식은
[공식 인증 안내](https://github.com/google-antigravity/antigravity-cli#authentication)에 있다.

### Mac의 키체인 접근

키체인 잠금과 실행 프로세스의 보안 세션은 별개다. `keychain_locked`는 실제 잠긴 상태를
확인한 경우다. `security unlock-keychain ~/Library/Keychains/login.keychain-db`를
실행하고 암호는 프롬프트에 입력한다.

`keychain_no_gui_session`은 현재 실행 세션이 macOS 승인 창을 띄울 수 없는 경우다. 일반
Mac Terminal에서 실행하거나 그 계정을 `--isolated`로 연다. 원격 세션에서 시작한 Herdr
서버는 로컬에서 붙어도 같은 보안 세션을 유지하고 새 pane도 그 세션을 물려받는다.
`source`로 셸 설정을 다시 읽거나 SSH 변수를 지워도 보안 세션은 바뀌지 않는다. 오너의
명시적 지시 없이 기존 Herdr 서버나 에이전트를 끄지 않는다.

원인을 좁히지 못하면 `keychain_interaction_not_allowed`로 안내하며 잠겼다고 단정하지
않는다. 접근 거부와 항목 없음은 별도 안내다. 기존 접근 권한은 유지한다.

`has list claude --usage`는 키체인 읽기가 막혀도 계정 행을 보여 주고 사용량과 공유 홈은
모름으로 두며 복구 안내를 한 줄 낸다. 전환은 사전 읽기가 막히면 쓰기 전에 실패한다.

## 🛠️ 개발

<details>
<summary>소스에서 빌드하고 검사하기</summary>

소스는 TypeScript다. CLI 패키지에는 실행 파일 하나, 두 README, 패키지 정보, 라이선스만
넣는다. 개인 프로필 데이터와 개발 의존성은 배포하지 않는다. 스킬 파일에는
`has/SKILL.md`, 화면 표시 정보, 라이선스를 넣는다.

```bash
bun install
bun run format
bun run check
bun scripts/build.ts /tmp/ha-switch-local.tgz
bun add --global --ignore-scripts /tmp/ha-switch-local.tgz
```

릴리스 파일은 `bun run pack:release /tmp/ha-switch-release-0.2.0`으로 만든다. 결과는
`ha-switch-0.2.0.tgz`, `has-skill-0.2.0.tgz`, `SHA256SUMS`다. 임시 폴더에서 빌드하며
같은 이름의 릴리스 파일이 있으면 덮어쓰지 않는다.

시험은 합성 홈, 가짜 실행 파일, 가짜 키체인만 쓰며 실제 로그인을 바꾸지 않는다.

</details>

[^bun-add]: [Bun의 전역 설치와 tarball 설치 문서](https://bun.sh/docs/pm/cli/add).
[^codex-skills]: [Codex 스킬 위치와 호출 방법](https://learn.chatgpt.com/docs/build-skills).
[^claude-skills]: [Claude Code 스킬 설치와 호출 방법](https://code.claude.com/docs/en/skills).
