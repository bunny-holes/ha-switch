---
uuid: 01a129d8-4ffd-70bf-bc03-991519f84579
type: guide
audience: 회사 계정과 개인 계정을 바꿔 쓰는 코딩 도구 사용자.
goal: 맥에서 Bun으로 Codex·Claude Code·Antigravity 계정을 보고 바꾼다.
tone: 짧은 평어체로 실행할 명령을 그대로 쓴다.
manner: 계정 전환과 데이터 위치를 먼저 설명하고 개발 정보는 뒤에 둔다.
---

# HA Switch

현재 계정과 확인 가능한 사용량을 보고, 번호로 Codex·Claude Code·Antigravity CLI 계정을 바꾼다.
HA는 Harness Account의 줄임말이다. 첫 버전은 맥을 지원한다.

[English](README.md)

## 실행

```bash
bunx @bunny-holes/ha-switch
```

Bun 1.4.2 이상과 `codex`, `claude`, `agy` 중 쓸 앱의 명령이 필요하다.
Codex와 Claude 계정은 앱의 별도 프로필에서 미리 로그인한다.
Antigravity는 `agy`로 각 계정에 로그인한 뒤 이름을 정해 저장한다.
전역 설치는 필요 없다.

## 처음 쓰기

컴퓨터에 있는 Codex와 Claude 프로필로 설정을 만든 뒤 목록을 본다.

```bash
bunx @bunny-holes/ha-switch init
bunx @bunny-holes/ha-switch list
```

`init`은 계정을 전환하지 않고 설정을 만든다.
Codex는 별도 `.codex-ha-switch` 폴더를 대상으로 쓰고 원래 프로필을 유지한다.
Claude는 대상 프로필의 설정을 유지하고 로그인과 계정 정보만 바꾼다.
기존 toolbox의 `codex-pools.json`과 `claude-pools.json`이 있으면 그 폴더를 가져온다.

```bash
bunx @bunny-holes/ha-switch import --from <directory>
```

원본 설정과 키체인 항목은 유지한다. 대상 설정이 다르면 덮어쓰지 않는다.
Claude의 저장 계정은 HA Switch의 키체인 이름으로 복사한다.

Antigravity 계정에 로그인한 상태에서 한 번 저장한다.

```bash
bunx @bunny-holes/ha-switch save agy personal
```

`agy`에서 다른 계정으로 로그인한 뒤 다른 이름으로 저장한다.

```bash
bunx @bunny-holes/ha-switch save agy work
bunx @bunny-holes/ha-switch list agy
bunx @bunny-holes/ha-switch switch agy 1
```

## 명령

아래 명령은 `bunx @bunny-holes/ha-switch` 다음에 쓴다.

| 할 일 | 명령 |
| --- | --- |
| 모든 계정과 사용량 보기 | `list` |
| Codex 계정과 사용량 보기 | `list codex` |
| Claude 계정과 사용량 보기 | `list claude` |
| 저장한 Antigravity 계정 보기 | `list agy` |
| 조회 요청이나 변경 없이 로컬 목록만 보기 | `list --local` |
| Codex를 2번 계정으로 바꾸기 | `switch codex 2` |
| Claude를 1번 계정으로 바꾸기 | `switch claude 1` |
| Antigravity를 2번 계정으로 바꾸기 | `switch agy 2` |
| 번호를 고르기 전에 목록 보기 | `switch codex` |
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

같은 도구에 계정 묶음이 여럿이면 `--pool <name>`으로 고른다.
다른 설정 폴더는 `--config-dir <directory>`로 지정한다.
`--version`은 패키지 버전을 보여 준다.

목록에는 현재 계정, 요금제, 상태, 5시간 잔량과 초기화 시각, 주간 잔량과 초기화 시각,
남은 리셋권이 나온다. 없는 값과 조회 실패를 0으로 바꾸지 않는다. 리셋권은 소비하지 않는다.

## 설정

기본 위치는 `~/.config/ha-switch/`다. `HA_SWITCH_CONFIG_DIR`로 다른 위치를 지정한다.
파일의 계정 순서가 전환 번호다.

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

전환 뒤 `list codex`, `list claude`, `list agy`를 실행한다. 현재 계정에 체크 표시가 나온다.
`list --local`은 네트워크 조회와 로그인 동기화를 건너뛴다.
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

소스는 TypeScript다. npm에는 실행 파일 하나, 두 README, 패키지 정보, 라이선스만 넣는다.
개인 프로필 데이터와 개발 의존성은 배포하지 않는다.

```bash
bun install
bun run format
bun run check
bun scripts/build.ts /tmp/ha-switch.tgz
```
