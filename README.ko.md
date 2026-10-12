

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

저장한 계정을 보고 번호로 바꾼다. 설정·플러그인·MCP 인증·대화 기록은 유지한다.
HA는 Harness Account의 줄임말이다.

| 도구 | 선택 옵션 | 저장한 계정 전환 | `has` 사용량 조회 |
| --- | --- | --- | --- |
| 🤖 Codex | `-h x` | ✅ | ✅ |
| ✳️ Claude Code | `-h c` | ✅ | ✅ |
| 🚀 Antigravity CLI | `-h a` | ✅ | 아직 없음 |

> [!NOTE]
> 각 도구에서 먼저 로그인한다. `has`는 저장한 계정을 바꾼다.
> `-c`는 현재 Antigravity 로그인을 저장하며, 새 로그인 화면을 열지 않는다.

## 📦 CLI 설치

GitHub Releases에서 CLI 패키지와 에이전트 스킬을 따로 받는다.
Bun 1.4.2 이상을 설치하고 릴리스 주소로 CLI를 설치한다.[^bun-add]

```bash
bun add --global --ignore-scripts https://github.com/bunny-holes/ha-switch/releases/download/v0.1.0/ha-switch-0.1.0.tgz
export PATH="$(bun pm bin --global):$PATH"
has --help
has --version
```

실행 명령은 `has`다. 패키지 이름은 `@bunny-holes/ha-switch`를 유지한다.
쓸 도구의 앱 명령인 `codex`, `claude`, `agy`도 필요하다.
공개된 v0.1.0 패키지에는 아직 `has x`와 `has c`가 없다. 다음 릴리스 전에는
아래 개발 절의 명령으로 소스를 빌드하고 설치한다.

## ⚡ 실행

실행 명령은 `has`다. 옵션 없이 실행하면 도움말을 보여 준다.

```bash
has
has --list
has x
has c -s 2
has x -- resume
has x --safe
```

출시 버전을 설치하기 전에는 이 저장소에서 `has` 대신 `bun src/bin.ts`를 쓴다.

Codex와 Claude 계정은 앱의 별도 프로필에서 미리 로그인한다.
Antigravity는 `agy`로 각 계정에 로그인한 뒤 이름을 정해 저장한다.

`has x`는 `CODEX_HOME`을 비우고 기본 `~/.codex`에서 Codex를 연다.
`has c`는 `CLAUDE_CONFIG_DIR`을 비우고 기본 `~/.claude`에서 Claude를 연다.
선택한 계정의 로그인을 그 기본 홈에 적용한다. 풀은 하나면 자동으로 고르고,
여럿이면 `--pool NAME`으로 고른다. `--account N`이나 `-s N`으로 계정 하나를
고른 뒤 실행할 수 있다. 번호가 없으면 Codex는 5시간 잔량이 10% 이상인
2·3번 중 잔량이 큰 쪽을 고른다. 둘 다 부족하면 주간 잔량이 20%보다 큰
1번을 쓴다. 없으면 실행하지 않는다. 필수 잔량이 없거나 조회가 실패해도
고르지 않는다. Claude는 현재 계정을 쓴다. 번호를 지정하면 자동 선택을 생략한다.

두 단축은 다음 앱 옵션을 하나씩 붙인다.

| 단축 | 붙이는 옵션 |
| --- | --- |
| `has x` | `--dangerously-bypass-approvals-and-sandbox` 또는 기존 `--yolo`, `--dangerously-bypass-hook-trust` |
| `has c` | `--dangerously-skip-permissions` |

`--safe`는 풀의 인수에 있던 것까지 포함해 위 옵션을 뺀다. 앱의 권한 설정은
그대로 적용된다. `has x --dry-run`과 `has c --dry-run`은 로그인 값을 읽거나
바꾸지 않고 실행 인수만 보여 준다. 앱도 실행하지 않는다. `--` 뒤의 인수는
앱에 넘긴다. `has c -s 2 -- --resume`은 2번 계정으로 바꾸고 Claude의 이어 열기
목록을 연다.

## 🧩 에이전트 스킬 설치

`has` 스킬은 설치된 CLI를 쓴다. 마켓플레이스나 MCP 서버 없이 설치할 수 있다.
Codex는 `~/.agents/skills/`에 설치하고 `$has`로 부른다.[^codex-skills]
Claude Code는 대신 `~/.claude/skills/`에 설치하고 `/has`로 부른다.[^claude-skills]

```bash
has_skill_archive="$(mktemp -d)/has-skill-0.1.0.tgz"
curl -fL https://github.com/bunny-holes/ha-switch/releases/download/v0.1.0/has-skill-0.1.0.tgz -o "$has_skill_archive"
mkdir -p "$HOME/.agents/skills"
test ! -e "$HOME/.agents/skills/has" && tar -xzf "$has_skill_archive" -C "$HOME/.agents/skills"
```

마지막 명령은 기존 `has` 스킬을 덮어쓰지 않는다. 갱신하기로 정하기 전까지 기존 폴더를 유지한다.
CLI 설치와 스킬 설치는 별개다.

## 🏁 처음 쓰기

컴퓨터에 있는 Codex와 Claude 프로필로 설정을 만든 뒤 목록을 본다.

```bash
has init
has switch --local
```

`init`은 계정을 전환하지 않고 설정을 만든다.
Codex는 `has x`, Claude는 `has c`로 연다. 도구마다 기본 홈 하나를 쓴다.
첫 기본 홈 전환 전에 `~/.codex`에 있던 원본 계정을
`~/.config/ha-switch/codex-accounts/native/auth.json`에 따로 보관한다.
기본 홈의 로그인 백업은 `~/.codex/auth.json.ha-switch-backup`에 둔다.
다른 원본 프로필도 실행 대상과 분리해서 유지한다. Claude의 계정 사본은
macOS 키체인에 두고, 기본 홈에서는 로그인과 계정 정보만 바꾼다.
`init`은 기존 `has run codex`와 호환되도록 `.codex-ha-switch` 실행 대상도 유지한다.
기존 toolbox의 `codex-pools.json`과 `claude-pools.json`이 있으면 그 폴더를 가져온다.

```bash
has import --from <directory>
```

원본 설정과 키체인 항목은 유지한다. 대상 설정이 다르면 덮어쓰지 않는다.
Claude의 저장 계정은 HA Switch의 키체인 이름으로 복사한다.

Antigravity 계정에 로그인한 상태에서 한 번 저장한다.

```bash
has -c a personal
```

`agy`에서 다른 계정으로 로그인한 뒤 다른 이름으로 저장한다.

```bash
has -c a work
has -h a
has -h a -s 1
```

## 🔄 toolbox에서 옮기기

toolbox 0.37.0에서 `codex-auth`와 `claude-auth`가 삭제됐다. `~/.zshenv`의
`codex-auth` 함수가 삭제된 스크립트를 부르면 실패한다. 이를 쓰는 `codex-pkls` 등
별칭도 함께 깨진다. 저장한 계정을 바꾸거나 앱을 열 때는 `has`를 쓴다.

옛 풀 설정을 아직 가져오지 않았다면 기본 경로는 다음과 같다.

```bash
has import --from "$HOME/.config/xiyo/toolbox"
```

기존 풀 파일이 있는 경로를 쓴다. 원본과 각 풀의 `args`는 유지한다.
이미 가져왔다면 그 설정을 그대로 쓴다.

| 옛 셸 명령 | HA Switch 명령 |
| --- | --- |
| `codex-pkls` | `has x` |
| `codex-pkls-N` | `has x --account N -- ARGS` 또는 `has x -s N -- ARGS` |
| `codex-switch` | `has switch` |
| `codex-switch NUMBER` | `has switch NUMBER` |
| `claude-auth` 실행 함수 | `has c` 또는 `has c -s N` |

`N`과 `NUMBER`에는 `has switch --local`에 나온 번호를 넣는다.
번호는 그 풀 안에서 1부터 시작한다. `ARGS`에는 Codex에 넘길 인수를 넣는다.
인수가 없으면 `-- ARGS`를 뺀다. 예를 들면 다음과 같다.

```bash
has x -s 2 -- resume
has switch 2
```

두 단축도 `-c web_search=live` 같은 풀의 `args`를 유지하고, 그 뒤에 `--` 다음
인수를 붙인다. 기존 `--yolo`가 있으면 Codex의 승인 생략 옵션으로 센다.
훅 신뢰 생략 옵션만 없으면 더 붙인다. 옛 셸 함수에만 있던 옵션은 가져오지 않는다.
기존 `has run`의 옵션 전달 방식은 유지한다.

옛 `.codex-pkls` 실행 홈은 폐기됐다. 그 홈을 대상으로 하는 기존 실행·전환·동기화·복원
명령은 `pool_home_retired` 오류를 내며 홈을 다시 만들지 않는다. 풀의 `home`을
`.codex`으로 바꾸고 계정 원본 목록은 유지한다. 풀 이름 `pkls`는 그대로 써도 된다.
`has switch codex N`과 `has x --account N`은 기본 홈의 로그인을 바꾼다.

`~/.codex`는 갈아끼우는 0번 자리다. 1·2·3번은 각 계정 원본이다.
처음 전환할 때 원래 `.codex` 로그인은 따로 보관한다. 전환 전에 갱신된 토큰을
같은 계정의 원본에 돌려쓴다. `*`는 기본 홈에 지금 적용된 계정을 가리킨다.

전환과 실행은 한 번에 하나씩 끝낸다. 동시에 실행하거나 토큰 갱신 중 전환하지 않는다.
열린 세션은 이미 읽은 로그인을 유지한다. HA Switch는 쓰기 전 변경 여부와
토큰의 계정을 확인하고, 실행 직전 선택 계정을 다시 확인한다.
별도 Codex 프로세스가 공유 로그인 파일에 쓰는 일까지 막지는 못한다.

설정은 `~/.codex/config.toml`을 쓴다. 옛 홈의 설정을 자동 복사하지 않는다.
추론 강도 등을 바꾸려면 풀의 `args`에 `"-c", "model_reasoning_effort=medium"`처럼 넣는다.
`has restore`는 기본 Codex 로그인을 복원한다.

### Codex 자동 선택

`has -h x`와 같은 잔량·상태 기준을 쓴다. 2·3번 중 조건을 만족한 계정의
5시간 잔량, 주간 잔량, 설정 순서로 고른다. 둘 다 부족하면 1번을 쓴다.
1번 주간 잔량이 20% 이하이면 `no_available_account`와 “사용 가능한 계정 없음”을
안내하고 종료 코드 1로 끝낸다. 계정을 바꾸거나 실행하지 않는다.
필수 잔량을 모르거나 조회가 실패하면 선택 후보에서 뺀다.

풀 설정의 `selection`으로 순서와 기준을 바꿀 수 있다.

```json
{
  "priority": [2, 3],
  "minimumFiveHourRemaining": 10,
  "fallback": 1,
  "minimumFallbackWeeklyRemaining": 20
}
```

## 🎛️ 명령

아래 명령은 `has` 다음에 쓴다.

| 할 일 | 명령 |
| --- | --- |
| 도움말 보기 | `--help` |
| 전체 도구·프로필·현재 선택·사용량 보기 | `--list` |
| Codex 프로필과 사용량 보기 | `-h x` |
| 기본 홈의 Codex 프로필과 사용량 보기 | `switch` |
| Claude 프로필과 사용량 보기 | `-h c` |
| 저장한 Antigravity 프로필 보기 | `-h a` |
| 조회 요청이나 변경 없이 로컬 목록만 보기 | `--list --local` |
| 기본 홈의 Codex를 2번 프로필로 바꾸기 | `switch 2` |
| 기존 Codex 풀의 실행 계정 바꾸기 | `-h x -s 2` |
| Claude를 1번 프로필로 바꾸기 | `-h c -s 1` |
| Antigravity를 2번 프로필로 바꾸기 | `-h a -s 2` |
| 저장된 로그인 사본 맞추기 | `sync` |
| 기본 홈의 Codex를 첫 전환 전 계정으로 돌리기 | `restore` |
| 폐기되지 않은 Codex 풀의 계정 돌리기 | `restore codex --pool NAME` |
| Claude를 직전 계정으로 돌리기 | `restore claude` |
| Antigravity를 첫 전환 전 계정으로 돌리기 | `restore agy` |
| 현재 Antigravity 로그인 저장하기 | `-c a <label>` |
| 기본 홈에서 Codex 이어 열기 | `x -- resume` |
| 2번 계정으로 바꾸고 Codex 이어 열기 | `x -s 2 -- resume` |
| 기본 홈에서 Claude 열기 | `c` |
| 계정을 바꾸고 Claude 이어 열기 | `c -s 2 -- --resume` |
| 승인 생략 옵션 없이 단축 실행하기 | `x --safe` 또는 `c --safe` |
| 로그인 변경 없이 실행 인수 확인하기 | `x --dry-run` 또는 `c --dry-run` |
| 기존 풀의 실행 대상 열기 | `run codex -- resume` 또는 `run claude` |
| 현재 계정으로 Antigravity 열기 | `run agy` |
| 기존 프로필로 로컬 설정 만들기 | `init` |
| 기존 설정과 Claude 저장 계정 가져오기 | `import --from <directory>` |

하네스는 여기서 다루는 코딩 도구를 뜻한다. `-h`나 `--harness`로 고른다.
Claude는 `c`나 `claude`, Codex는 `x`나 `codex`, Antigravity는 `a`나 `antigravity`로 쓴다.
Antigravity의 앱 명령인 `agy`도 받는다.
프로필 번호는 `-s`나 `--switch`로 고른다.
`has --harness claude --switch 2`는 Claude를 2번 프로필로 바꾼다.
`has x`와 `has c`에서 `-s N`은 `--account N`의 단축이며 앱도 실행한다.
`has -h c -s N`은 설정된 대상의 로그인만 바꾼다. 대상이 기본 `~/.claude`라면
그 뒤 `claude`로 실행해도 바꾼 계정을 쓴다.
도움말은 `--help`로 본다. `-h`는 하네스 선택에 쓴다.
현재 Antigravity 로그인은 `-c`나 `--create`에 하네스와 이름을 지정해 저장한다.
`has --create antigravity personal`은 현재 로그인을 저장하고 로그인 화면을 열지 않는다.
Codex와 Claude 계정 등록은 아직 지원하지 않는다. `has save agy <label>`도 쓸 수 있다.

같은 도구에 계정 묶음이 여럿이면 `--pool <name>`으로 고른다.
다른 설정 폴더는 `--config-dir <directory>`로 지정한다.
`--version`은 패키지 버전을 보여 준다.

목록에는 현재 계정, 요금제, 상태, 5시간 잔량과 초기화 시각, 주간 잔량과 초기화 시각,
남은 리셋권이 나온다. 없는 값과 조회 실패를 0으로 바꾸지 않는다. 리셋권은 소비하지 않는다.

## ⚙️ 설정

기본 위치는 `~/.config/ha-switch/`다. `HA_SWITCH_CONFIG_DIR`로 다른 위치를 지정한다.
각 계정 묶음에 적힌 계정 순서가 프로필 번호다.

<details>
<summary>설정 파일 예시</summary>

`codex-pools.json`:

```json
{
  "default": {
    "home": ".codex-ha-switch",
    "accounts": [".codex-personal", ".codex-work"],
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
`home`은 기존 `run`, `-h`, 도구 이름을 직접 쓰는 명령의 실행 대상이다.
`x`와 `c`는 계정 순서·원본 경로·`args`를 유지하면서 기본 홈을 쓴다.

`agy-pools.json`은 `has -c a <label>`이 만든다. `accounts`에는 저장한 계정 이름이 들어간다.

</details>

## ✅ 확인

기본 Codex 홈에서 바꾼 뒤에는 `has switch --local`로 확인한다.
설정된 풀의 대상은 `has -h x`, `has -h c`, `has -h a`로 확인한다. 현재 프로필에 `*`가 나온다.
`has --list --local`은 네트워크 조회와 로그인 동기화를 건너뛴다.
Codex의 일반 목록 조회는 만료된 로그인을 갱신하고 사본을 맞출 수 있다.
Claude 목록 조회는 로그인 값을 바꾸지 않는다. 사본은 `sync claude`로 맞춘다.
만료된 로그인은 Claude 앱에서 갱신한다.

## 🔐 데이터와 제한

Codex는 앱의 `auth.json` 로그인 정보를 대상 프로필에 복사하고, 설치된 app-server로 사용량을 조회한다.
Claude와 Antigravity는 앱이 쓰는 macOS 키체인 형식을 따른다.
저장한 계정과 로그인 백업도 키체인에 둔다. 별도 암호화 보관소를 만들지 않는다.
Claude는 계정마다 로그인 사본 하나, 계정 묶음마다 복원 사본 하나를 둔다.
대상 프로필의 로그인을 바꿔도 원래 계정으로 돌아갈 수 있도록 사본을 유지한다.
프로필 폴더 전체를 교체하지 않는다. 설정·플러그인·MCP 인증·대화 기록은 유지한다.
실행 중인 앱은 이미 읽은 로그인을 계속 쓸 수 있다. 전환한 계정은 다음 앱 실행에서 쓴다.

Antigravity CLI의 사용량은 아직 조회하지 않는다. 없는 값은 알 수 없음으로 표시한다.
Antigravity IDE 전환과 Gemini CLI는 대상에 포함하지 않는다.
Claude Console 프로필, 클라우드 인증, 파일 없이 키링만 쓰는 Codex 로그인은 첫 버전에서 다루지 않는다.
Windows와 Linux 어댑터는 별도 검증이 필요하다.

인증 어댑터는 [Codex app-server 문서](https://learn.chatgpt.com/docs/app-server)와
[Claude Code 인증 문서](https://code.claude.com/docs/en/authentication)의 도구별 형식을 따른다.
Antigravity의 기본 저장 방식은
[공식 인증 안내](https://github.com/google-antigravity/antigravity-cli#authentication)에 설명되어 있다.

## 🛠️ 개발

<details>
<summary>소스에서 빌드하고 검사하기</summary>

소스는 TypeScript다. CLI 패키지에는 실행 파일 하나, 두 README, 패키지 정보, 라이선스만 넣는다.
개인 프로필 데이터와 개발 의존성은 배포하지 않는다.
스킬 파일에는 `has/SKILL.md`, 화면 표시 정보, 라이선스를 넣는다.

```bash
bun install
bun run format
bun run check
bun scripts/build.ts /tmp/ha-switch-local.tgz
bun add --global --ignore-scripts /tmp/ha-switch-local.tgz
```

릴리스 파일은 `bun run pack:release /tmp/ha-switch-release-0.1.0`으로 만든다.
결과는 `ha-switch-0.1.0.tgz`, `has-skill-0.1.0.tgz`, `SHA256SUMS`다.
임시 폴더에서 빌드하며, 같은 이름의 릴리스 파일이 있으면 덮어쓰지 않는다.
`bun scripts/build.ts /tmp/ha-switch.tgz`는 CLI 패키지만 만든다.

</details>

[^bun-add]: [Bun의 전역 설치와 tarball 설치 문서](https://bun.sh/docs/pm/cli/add).
[^codex-skills]: [Codex 스킬 위치와 호출 방법](https://learn.chatgpt.com/docs/build-skills).
[^claude-skills]: [Claude Code 스킬 설치와 호출 방법](https://code.claude.com/docs/en/skills).

`has restore c --pool NAME`은 기본 Claude 홈을 복원합니다.
`has restore claude --pool NAME`은 기존 풀 홈을 복원합니다.

새 세션이 선택한 로그인을 읽고 시작하면 다음 터미널을 열어도 된다.
기존 세션을 닫을 필요는 없다. 전환·시작 단계만 겹치지 않게 한다.

## 원격 Mac의 키체인 접근

재부팅 뒤 SSH/mosh에서는 로그인 키체인의 비밀 읽기가 막힐 수 있다.
`keychain_interaction_not_allowed`는 접근 시 상호작용이 막힌 상태이며 로그인 항목이 없다는 뜻이 아니다.
Mac에서 `security unlock-keychain ~/Library/Keychains/login.keychain-db`를 실행하고
암호는 프롬프트에 입력한다. 그래도 안 되면 Mac 화면의 키체인 접근 앱에서 허용한다.
접근 권한을 무제한으로 바꾸거나 암호를 명령 인수·환경 변수·로그·파일에 넣지 않는다.

`has -h c`는 계정 목록을 표시하고 잔량·현재 계정은 확인 불가로 두며 복구 안내를 한 번 낸다.
이 버전은 이전 사용량을 저장하지 않으므로 마지막 잔량을 복구할 수 없다.
항목이 없으면 로그아웃 상태와 로그인 안내를, 접근이 거부되면 접근 불가 안내를 낸다.
전환은 실패하며 로그인 파일이나 키체인 값을 바꾸지 않는다. 모르는 잔량을 0으로 표시하지 않는다.
