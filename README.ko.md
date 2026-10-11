---
uuid: 01a129d8-4ffd-70bf-bc03-991519f84579
type: guide
audience: 회사 계정과 개인 계정을 바꿔 쓰는 코딩 도구 사용자.
goal: 맥에서 Bun으로 Codex·Claude Code·Antigravity 계정을 보고 바꾼다.
tone: 짧은 평어체로 실행할 명령을 그대로 쓴다.
manner: 계정 전환과 데이터 위치를 먼저 설명하고 개발 정보는 뒤에 둔다.
---

# HA Switch

관리 중인 Codex·Claude Code·Antigravity CLI 프로필을 보고 번호로 계정을 바꾼다.
HA는 Harness Account의 줄임말이다. 현재 버전은 맥을 지원한다.

[English](README.md)

## CLI 설치

GitHub Releases에서 CLI 패키지와 에이전트 스킬을 따로 받는다.
아래 명령은 `v0.1.0` 릴리스가 공개된 뒤 쓸 수 있다.
Bun 1.4.2 이상을 설치하고 릴리스 주소로 CLI를 설치한다.[^bun-add]

```bash
bun add --global --ignore-scripts https://github.com/bunny-holes/ha-switch/releases/download/v0.1.0/ha-switch-0.1.0.tgz
export PATH="$(bun pm bin --global):$PATH"
has --help
has --version
```

실행 명령은 `has`다. 패키지 이름은 `@bunny-holes/ha-switch`를 유지한다.
쓸 도구의 앱 명령인 `codex`, `claude`, `agy`도 필요하다.

## 실행

실행 명령은 `has`다. 옵션 없이 실행하면 도움말을 보여 준다.

```bash
has
has --list
has -h c -s 2
```

출시 버전을 설치하기 전에는 이 저장소에서 `has` 대신 `bun src/bin.ts`를 쓴다.

Codex와 Claude 계정은 앱의 별도 프로필에서 미리 로그인한다.
Antigravity는 `agy`로 각 계정에 로그인한 뒤 이름을 정해 저장한다.

## 에이전트 스킬 설치

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

## 처음 쓰기

컴퓨터에 있는 Codex와 Claude 프로필로 설정을 만든 뒤 목록을 본다.

```bash
has init
has --list
```

`init`은 계정을 전환하지 않고 설정을 만든다.
Codex는 별도 `.codex-ha-switch` 폴더를 대상으로 쓰고 원래 프로필을 유지한다.
선택한 계정으로 Codex를 쓰려면 `has run codex`로 연다.
Claude는 대상 프로필의 설정을 유지하고 로그인과 계정 정보만 바꾼다.
기존 toolbox의 `codex-pools.json`과 `claude-pools.json`이 있으면 그 폴더를 가져온다.

```bash
has import --from <directory>
```

원본 설정과 키체인 항목은 유지한다. 대상 설정이 다르면 덮어쓰지 않는다.
Claude의 저장 계정은 HA Switch의 키체인 이름으로 복사한다.

Antigravity 계정에 로그인한 상태에서 한 번 저장한다.

```bash
has save agy personal
```

`agy`에서 다른 계정으로 로그인한 뒤 다른 이름으로 저장한다.

```bash
has save agy work
has -h a
has -h a -s 1
```

## 명령

아래 명령은 `has` 다음에 쓴다.

| 할 일 | 명령 |
| --- | --- |
| 도움말 보기 | `--help` |
| 전체 도구·프로필·현재 선택·사용량 보기 | `--list` |
| Codex 프로필과 사용량 보기 | `-h x` |
| Claude 프로필과 사용량 보기 | `-h c` |
| 저장한 Antigravity 프로필 보기 | `-h a` |
| 조회 요청이나 변경 없이 로컬 목록만 보기 | `--list --local` |
| Codex를 2번 프로필로 바꾸기 | `-h x -s 2` |
| Claude를 1번 프로필로 바꾸기 | `-h c -s 1` |
| Antigravity를 2번 프로필로 바꾸기 | `-h a -s 2` |
| 저장된 로그인 사본 맞추기 | `sync` |
| Codex를 첫 전환 전 계정으로 돌리기 | `restore codex` |
| Claude를 직전 계정으로 돌리기 | `restore claude` |
| Antigravity를 첫 전환 전 계정으로 돌리기 | `restore agy` |
| 현재 Antigravity 로그인 저장하기 | `save agy <label>` |
| 선택된 계정으로 Codex 이어 열기 | `run codex -- resume` |
| 2번 계정으로 바꾸고 Codex 이어 열기 | `run codex --account 2 -- resume` |
| 대상 프로필의 현재 계정으로 Claude 열기 | `run claude` |
| 현재 계정으로 Antigravity 열기 | `run agy` |
| 기존 프로필로 로컬 설정 만들기 | `init` |
| 기존 설정과 Claude 저장 계정 가져오기 | `import --from <directory>` |

하네스는 여기서 다루는 코딩 도구를 뜻한다. `-h`나 `--harness`로 고른다.
Claude는 `c`나 `claude`, Codex는 `x`나 `codex`, Antigravity는 `a`나 `antigravity`로 쓴다.
Antigravity의 앱 명령인 `agy`도 받는다.
프로필 번호는 `-s`나 `--switch`로 고른다.
`has --harness claude --switch 2`는 Claude를 2번 프로필로 바꾼다.
도움말은 `--help`로 본다. `-h`는 하네스 선택에 쓴다.

같은 도구에 계정 묶음이 여럿이면 `--pool <name>`으로 고른다.
다른 설정 폴더는 `--config-dir <directory>`로 지정한다.
`--version`은 패키지 버전을 보여 준다.

목록에는 현재 계정, 요금제, 상태, 5시간 잔량과 초기화 시각, 주간 잔량과 초기화 시각,
남은 리셋권이 나온다. 없는 값과 조회 실패를 0으로 바꾸지 않는다. 리셋권은 소비하지 않는다.

## 설정

기본 위치는 `~/.config/ha-switch/`다. `HA_SWITCH_CONFIG_DIR`로 다른 위치를 지정한다.
각 계정 묶음에 적힌 계정 순서가 프로필 번호다.

`codex-pools.json`:

```json
{
  "default": {
    "home": ".codex-ha-switch",
    "accounts": [".codex-personal", ".codex-work"],
    "args": []
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

`agy-pools.json`은 `save agy`가 만든다. `accounts`에는 저장한 계정 이름이 들어간다.

## 확인

전환 뒤 `has -h x`, `has -h c`, `has -h a`를 실행한다. 현재 프로필에 `*`가 나온다.
`has --list --local`은 네트워크 조회와 로그인 동기화를 건너뛴다.
Codex의 일반 목록 조회는 만료된 로그인을 갱신하고 사본을 맞출 수 있다.
Claude 목록 조회는 로그인 값을 바꾸지 않는다. 사본은 `sync claude`로 맞춘다.
만료된 로그인은 Claude 앱에서 갱신한다.

## 데이터와 제한

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

## 개발

소스는 TypeScript다. CLI 패키지에는 실행 파일 하나, 두 README, 패키지 정보, 라이선스만 넣는다.
개인 프로필 데이터와 개발 의존성은 배포하지 않는다.
스킬 파일에는 `has/SKILL.md`, 화면 표시 정보, 라이선스를 넣는다.

```bash
bun install
bun run format
bun run check
bun run pack:release /tmp/ha-switch-release-0.1.0
```

릴리스 빌드는 `ha-switch-0.1.0.tgz`, `has-skill-0.1.0.tgz`, `SHA256SUMS`를 만든다.
임시 폴더에서 빌드하며, 같은 이름의 릴리스 파일이 있으면 덮어쓰지 않는다.
`bun scripts/build.ts /tmp/ha-switch.tgz`는 CLI 패키지만 만든다.

[^bun-add]: [Bun의 전역 설치와 tarball 설치 문서](https://bun.sh/docs/pm/cli/add).
[^codex-skills]: [Codex 스킬 위치와 호출 방법](https://learn.chatgpt.com/docs/build-skills).
[^claude-skills]: [Claude Code 스킬 설치와 호출 방법](https://code.claude.com/docs/en/skills).
