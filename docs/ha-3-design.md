# HA-3 ha-switch 기획·CLI 설계·인계

설계일: 2026-10-12. 복원일: 2026-10-13.

`/private/tmp/ha-switch-HA-3-design.md`가 사라져 이 세션의 대화에 남은 설계를 복원했다. plug-hole 세션의 검토와 추가 지시를 모두 포함한다. 원본과 바이트 단위로 같은 파일이라는 뜻은 아니다. 계정 이름과 화면 값은 모두 합성 예시다. 실제 계정·이메일·토큰은 넣지 않았다.

기준은 HA-2 브랜치 `fix/ha-2-profile-launch`의 `3e2e978`이다. 구현 중간본은 plug-hole 세션이 `wip/ha-3-20261013`의 `0199153`으로 보관했다. 이 문서의 CLI 화면과 동작은 구현 목표다. 현재 코드가 이 설계를 모두 구현한 상태는 아니다.

## 1. 맡은 일과 범위

ha-switch의 인터페이스를 말끔하게 다시 만든다. 순서는 기획 → CLI 디자인 → 구현이다. 도움말 한 화면으로 처음 쓰는 사람이 시작할 수 있고, 매일 하는 일을 한 명령으로 끝내는 것이 목표다.

통제 세션은 plug-hole이다. 단계별 보고는 `herdr agent prompt wC:p1`로 한다. 검토를 보낸 주체는 오너가 아니라 plug-hole 세션이다.

원래 범위는 사용성 조사, 웹 조사, 설계 문서, 구현, 가짜 계정 시험, 문서·스킬 갱신, 커밋·push였다. 2026-10-13의 최종 지시는 구현을 멈추고 이 문서와 경쟁 도구 조사 문서만 복원해 커밋·push하는 것이다. 구현 마무리는 Claude 세션이 이어받는다.

다음은 하지 않는다.

- 실제 계정 로그인·전환 시험
- 실제 `~/.config/ha-switch` 설정 수정
- `.zshenv` 수정
- 태그·릴리스·npm publish·전역 설치본 교체
- 다른 저장소 수정

## 2. 기획: 누가 언제 무엇을 하는가

사용자는 macOS에서 여러 Codex, Claude Code, Antigravity 계정을 쓴다. 주로 Herdr pane에서 일한다. 오래된 셸 별칭처럼 빨리 시작하고 싶다. 쓰던 설정·기록·플러그인·MCP를 공유 홈에 유지하는 일도 자주 한다.

| 일 | 빈도 | 앞 단계의 흐름 | 목표 흐름·단계 수 |
| --- | --- | --- | --- |
| 계정과 잔량 훑기 | 자주 | 목록 옵션과 도구별 문법을 기억 | `has` 한 번, 1단계 |
| 잔량 좋은 계정으로 공유 홈에서 열기 | 매일 | `has x`가 자동 선택·전환·실행 | `has run codex` 한 번, 1단계 |
| Claude 현재 공유 홈에서 열기 | 매일 | `has c`가 먼저 키체인을 읽어 실패할 수 있음 | `has run claude` 한 번, 1단계 |
| 이름으로 계정 골라 공유 홈에서 열기 | 자주 | shortcut과 번호 옵션이 섞임 | `has run TOOL NAME`, 1단계 |
| 다른 계정을 나란히 열기 | 자주 | HA-2의 source 프로필 직접 실행 | `has run TOOL NAME --isolated`, 1단계 |
| 공유 로그인만 바꾸기 | 필요할 때 | `switch`, `-s`, `-h` 조합 | `has switch TOOL SELECTOR`, 1단계 |
| 직전 선택으로 돌아가기 | 필요할 때 | 명확한 선택 이력 경로가 없음 | `has switch TOOL -`, 1단계 |
| 첫 전환 전 원본 복구 | 복구할 때 | adapter별 restore·백업 동작 | `has restore TOOL`, 1단계 |
| 새 계정 등록 | 가끔 | 별도 본체 로그인 뒤 설정 손 편집 | `has add TOOL NAME`, 한 명령 안에서 로그인·확인·등록 |
| 지금 사용량 갱신 | 필요할 때 | 목록과 인증 조회가 섞일 수 있음 | `has list [TOOL] --usage`, 1단계 |

단계 수는 사용자가 칠 명령 수다. 공식 브라우저 로그인에서 필요한 클릭까지 한 단계라고 주장하지 않는다.

기본 대시보드와 목록은 키체인·네트워크를 읽지 않는다. shared `run`은 계정을 바꾼 뒤 기본 native 홈에서 실행한다. `--isolated`는 source 프로필에서만 실행한다. 기존 token freshness 검사, 백업, 쓰기 직전 재확인, 원자적 파일 교체는 전역 쓰기 경로에서 유지한다.

## 3. 조사와 근거

2026-10-12에 웹으로 직접 연 문서·README·도움말·이슈의 조사 결과다. 2026-10-13 복원 때 새 조사를 하지 않았다. 당시 조사에서 문서로 본 동작과 ha-switch에 적용할 판단을 구분한다. 경쟁 도구를 설치해 실제 로그인·전환을 시험한 결과는 아니다.

### 명령 표면과 실행 범위

- [gh auth switch](https://cli.github.com/manual/gh_auth_switch), [gh auth status](https://cli.github.com/manual/gh_auth_status): 조회와 전환을 나누고, 여러 후보는 명시 선택 또는 대화형 선택으로 푼다. ha-switch도 목록과 전환을 분리한다. 두 계정일 때 자동으로 다른 계정을 고르는 gh 동작은 가져오지 않는다. 여기서는 사용량 정책이나 명시 선택이 기준이다.
- [gcloud configurations](https://docs.cloud.google.com/sdk/gcloud/reference/config/configurations), [gcloud topic configurations](https://docs.cloud.google.com/sdk/gcloud/reference/topic/configurations): named configuration을 조회·생성·활성화한다. 한 명령만 바꾸는 옵션도 있다. source 프로필 실행과 공유 native 로그인 교체를 구분하는 근거다.
- [AWS named profiles](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-files.html), [AWS command options](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-options.html): `--profile`은 한 명령에 적용되고 환경 변수는 셸 범위에 적용된다. 격리 실행을 명시하는 관례다.
- [kubectl use-context](https://kubernetes.io/docs/reference/kubectl/generated/kubectl_config/kubectl_config_use-context/), [kubectx](https://github.com/ahmetb/kubectx), [git switch](https://git-scm.com/docs/git-switch): 이름으로 고르고, kubectx·Git의 `-`는 직전 선택으로 돌아간다. `switch TOOL -`에 적용한다.
- [nvm](https://github.com/nvm-sh/nvm), [fnm](https://github.com/Schniz/fnm), [mise use](https://mise.jdx.dev/cli/use.html), [mise exec](https://mise.jdx.dev/cli/exec): 기본 선택과 한 프로세스 실행을 구분한다. ha-switch는 기존 매일 쓰던 공유 실행을 `run` 기본으로 유지하고, 프로필 실행은 `--isolated`로 드러낸다.
- [claude-swap](https://github.com/realiti4/claude-swap), [codex-auth](https://github.com/Loongphy/codex-auth), [clauth](https://github.com/uwuclxdy/clauth), [caam](https://github.com/Dicklesworthstone/coding_agent_account_manager), [Claude account switcher](https://github.com/Nemo-Illusionist/claude-code-account-switcher): 등록·사용량 표·이름 선택·격리 실행의 실제 선례다. 필요한 작은 공통 부분만 가져온다. 자세한 비교는 [ha-3-competitors.md](ha-3-competitors.md)에 남겼다.

### 도움말·출력·선택기

- [CLI Guidelines](https://clig.dev/): `-h`는 도움말, stdout은 데이터, stderr는 진단이다. TTY에서만 질문하고 기계용 JSON을 지원한다. 오류는 원인과 다음 행동을 알려 준다.
- [12 Factor CLI Apps](https://jdxcode.medium.com/12-factor-cli-apps-dd3c227a0e46): 여러 명령의 일관성, 도움말, 옵션과 종료 코드의 관례를 참고했다. 무인자 `has`를 도움말 대신 대시보드로 하는 것은 이 도구의 주된 조회 업무에 맞춘 의도적 선택이다.
- [Heroku CLI style guide](https://devcenter.heroku.com/articles/cli-style-guide): 사람용 출력, 일관된 동사, 데이터와 진단 분리, 짧은 완료 문장을 따른다. Heroku의 topic 문법이나 모든 입력을 flag로 만드는 방식은 이 작은 도구에 적용하지 않는다.
- [GNU option conventions](https://www.gnu.org/prep/standards/html_node/Command_002dLine-Interfaces.html), [POSIX utility conventions](https://pubs.opengroup.org/onlinepubs/9699919799/utilities/V3_chap01.html): 표준 도움말과 옵션 문법을 참고했다. `--`는 이후 인수를 본체에 전달하는 경계다.
- [NO_COLOR](https://no-color.org/): 비어 있지 않은 `NO_COLOR`이면 ANSI 색을 끈다.
- [fzf README](https://github.com/junegunn/fzf), [fzf manual](https://github.com/junegunn/fzf/blob/master/man/man1/fzf.1): 목록을 받아 선택을 돌려주는 관례를 참고했다. fzf를 필수 설치로 만들지 않는다. 기본 선택기는 번호 입력이다.

### 본체 인증·프로필

- [Codex 공식 CLI 안내](https://learn.chatgpt.com/docs/codex/cli), [Codex 공식 저장소](https://github.com/openai/codex): 공식 본체 로그인과 `CODEX_HOME`을 사용한다. Codex 사용량은 기존 공식 app-server 경로를 유지하고 모델 요청을 시작하지 않는다.
- [Claude 인증](https://code.claude.com/docs/en/authentication), [Claude 환경 변수](https://code.claude.com/docs/ko/env-vars), [Claude CLI reference](https://code.claude.com/docs/en/cli-reference): `claude auth login`, `claude auth status`, `CLAUDE_CONFIG_DIR`을 따른다. 디렉터리마다 설정·기록·플러그인이 갈라진다. 모든 인증 방법이 디렉터리 하나만으로 격리된다고 약속하지 않는다.
- [Antigravity 설치·인증](https://www.antigravity.google/docs/cli/install/), [Antigravity reference](https://antigravity.google/docs/cli/reference/): native keyring과 본체의 브라우저 로그인 흐름을 사용한다. 당시 문서에서 별도의 격리 계정 로그인 명령을 확인하지 못했으므로 `add agy`는 기존 현재 로그인 저장으로 한정한다.

Claude 사용량 조회는 기존 adapter를 재사용할 설계다. 공개 공식 usage API 계약을 이번 조사로 입증한 것은 아니다. 새 인증·사용량 API를 만들지 않는다.

### 이슈에서 배운 것

- [cswap #390](https://github.com/realiti4/claude-swap/issues/390): 멀티플렉서에서 TUI 마우스 문제. `has`는 전체 화면을 열지 않고 한 번 출력한 뒤 끝낸다.
- [cswap #376](https://github.com/realiti4/claude-swap/issues/376): 오래된 usage를 현재처럼 표시하는 문제. 값에 시각·나이·오래됨을 함께 표시한다.
- [cswap #337](https://github.com/realiti4/claude-swap/issues/337): 실행 배너가 stdout 기계 출력을 깨뜨리는 문제. run 배너는 stderr로 보낸다.
- [codex-auth #162](https://github.com/Loongphy/codex-auth/issues/162): 열린 app-server가 이전 인증을 기억하는 문제. 공유 로그인 파일을 바꿨다는 사실과 열린 본체 세션의 인증을 구분한다.
- [codex-auth #158](https://github.com/Loongphy/codex-auth/issues/158): 공용 active 상태와 동시 실행 충돌. 병렬 계정 실행은 `--isolated`를 명시한다.
- [caam #19](https://github.com/Dicklesworthstone/coding_agent_account_manager/issues/19): 오래된 refresh token 복구 사고. 기존 freshness와 재확인 장치를 약화하지 않는다.
- [caam #69](https://github.com/Dicklesworthstone/coding_agent_account_manager/issues/69): HOME 격리가 다른 도구 인증을 숨기는 문제. ha-switch는 전체 HOME을 바꾸거나 다른 도구 설정을 복사하지 않는다.

기존 요청 폴더의 `readmes/`·`src/` 사본, HA-1·HA-2 보고서도 읽었다. 원본 임시 경로는 복원 시 사라져 여기의 웹 링크와 대화 기록을 인계 근거로 남긴다.

## 4. 최종 명령 표면

일상 명령은 다섯 개다.

```text
has
has list [TOOL] [--usage] [--json]
has run TOOL [SELECTOR] [--safe] [--isolated] [-- ARGS...]
has switch TOOL [SELECTOR]
has add TOOL NAME
has restore TOOL
```

`TOOL`은 도움말에 `codex`, `claude`, `agy`를 보인다. 명령 뒤 TOOL 자리에서는 `x`, `c`, `a`도 각각 짧은 이름으로 받는다. 최상위 옛 명령 `has x`와 새 입력 `has run x`는 다르다.

`--pool NAME`과 `--config-dir DIR`은 공통 옵션이다. 여러 풀이면 이름을 명시한다. `--` 뒤 인수는 run이 본체에 그대로 전달한다. 도움말을 찾는 옵션은 그 경계 앞에서만 해석한다.

### run의 기본값과 범위

| 입력 | 선택·로그인 동작 | 실행 홈 |
| --- | --- | --- |
| `has run codex` | live usage와 기존 selection 정책으로 자동 선택 후 안전 전환 | native `~/.codex` |
| `has run codex work` | 명시 계정 검증 후 안전 전환. usage는 필요 없음 | native `~/.codex` |
| `has run claude` | 관리자 키체인 읽기 없이 현재 본체 로그인 사용 | native `~/.claude` |
| `has run claude work` | 명시 계정 검증 후 안전 전환 | native `~/.claude` |
| `has run TOOL work --isolated` | source 환경으로 실행. 공유 로그인 교체 없음 | 설정된 source |
| `has switch TOOL work` | 안전 전환만 함. 본체를 열지 않음 | native target |

`run` 기본값은 옛 shortcut의 공유 실행을 보존한다. 이것을 source 실행만으로 바꾸면 오너가 매일 하는 일이 두 명령이 되고 자동 선택이 사라진다는 plug-hole 검토를 반영했다.

`--isolated`만 source 실행이다. 설정·기록·플러그인·MCP를 자동으로 합치거나 복사하지 않는다. 전체 HOME도 바꾸지 않는다.

Antigravity는 기존 native keyring 전환 뒤 실행을 유지한다. 문서화된 격리 인증 경로를 확인하지 못했으므로 `run agy --isolated`는 지원한다고 약속하지 않는다.

### 자동 선택·풀 args·승인 옵션

Codex는 기존 `selection.priority`, `minimumFiveHourRemaining`, `fallback`, `minimumFallbackWeeklyRemaining`을 그대로 읽는다. live usage를 써서 고르며, 실패한 조회나 오래된 cache는 자동 선택에 쓰지 않는다. 전부 조회 실패라면 `selection_usage_unavailable`로 멈춘다. 사용 가능 계정이 없으면 `no_available_account`로 멈춘다.

풀의 `args`와 `--` 뒤 인수는 원래 순서로 합친다. 옛 shortcut의 기본 승인 생략 플래그도 run에 유지한다.

```text
Codex:
  --dangerously-bypass-approvals-and-sandbox
  --dangerously-bypass-hook-trust
Claude:
  --dangerously-skip-permissions
```

`--yolo`는 기존 assembler가 다루는 Codex 승인 생략 별칭이다. 같은 플래그를 두 번 넣지 않는다. `--safe`는 풀 args와 승인 생략 플래그를 빼고 native 설정을 따른다는 검토 반영 설계다. 기존 `shortcutArguments`의 실제 safe 동작과 이 새 약속이 맞는지는 구현 때 시험해야 한다. 본체에 넘기는 `--` 뒤 인수의 경계와 뜻도 보존해야 한다.

공유 run과 isolated run 모두 같은 args 정책을 적용한다. 기본값을 조용히 바꿔 매일 쓰는 명령에 새 승인 프롬프트가 생기지 않게 한다.

## 5. selector 규칙·TTY

1. `-`: 직전 성공한 shared 선택. 현재가 A였고 B로 성공한 뒤 `switch -`는 A를 고른다.
2. 숫자: 해당 pool 표의 1부터 시작하는 행 번호.
3. 전체 이름: 정확 일치 우선. 대소문자를 무시한다.
4. 이름 조각: 하나만 남을 때 선택한다.
5. 여러 후보: TTY에서 후보 번호 선택기를 연다. non-TTY 또는 JSON이면 후보와 다음 명령을 담은 사용 오류로 끝낸다.
6. selector 생략: switch와 isolated run은 TTY에서 선택한다. shared Codex run은 자동 선택, shared Claude run은 현재 native 홈 실행이다.
7. Enter는 확정. `q`, Esc, Ctrl-C는 취소. 취소 코드는 130이며 native 쓰기를 하지 않는다.

stdin과 stdout이 모두 TTY일 때만 질문한다. `--no-input` 또는 JSON이면 질문하지 않는다. 파이프나 CI에서는 입력을 기다리지 않는다.

fzf는 선택 사항이다. 필수 의존성으로 추가하지 않는다. 기본은 작은 번호 프롬프트이고, fzf를 쓴다면 종료·취소·없는 실행 파일도 처리해야 한다.

```text
Select Codex account
1) work
2) personal
Number or name (q to cancel):
```

```text
$ has switch codex < /dev/null
has: selector_required — choose an account first
Next: has switch codex work
```

후보가 여러 개면 임의로 첫 계정을 택하지 않는다. 화면 번호는 pool마다 시작하므로 모든 목록·JSON 행에 tool과 pool을 붙인다.

## 6. 실제 터미널 모양

아래는 모두 목표 화면이다. 값과 이름은 합성 데이터다. `0.2.0`은 당시 설계용 판 표기이며 실제 패키지 판은 중간본에서 `0.1.0`이다. 이번 문서 복원은 판을 올리거나 릴리스를 만들지 않는다.

### 무인자 has

전체 화면 TUI나 자동 질문이 아니다. 설정·마지막 usage cache·확인 시각만 사용하고 한 번 출력한 뒤 끝난다.

```text
$ has
HA Switch 0.2.0 · local dashboard

TOOL    #  NAME      SHARED HOME  5H LEFT  5H RESET  7D LEFT  7D RESET  CREDITS  STATUS
codex   1  work      current      74%      in 1h     61%      in 2d     2        fresh · 4m ago
codex   2  personal  —            0%       in 12m    18%      in 2d     0        fresh · 4m ago
claude  1  work      unknown      42%      in 2h     ?        —         ?        stale · 2h ago
agy     1  personal  unknown      ?        —         ?        —         ?        unknown

Shared home is the last checked native login; isolated sessions are separate.
Run:     has run <tool> <name>
Live:    has list --usage
Switch:  has switch <tool> <name>
```

`SHARED HOME`은 공유 native 홈의 계정이다. isolated 세션과는 무관하다. 기본 화면이 native credential을 읽지 않으므로 마지막 확인 또는 선택 기록만 알고 있다. 그 기록을 지금 확정된 로그인처럼 보이게 해서는 안 된다. 시각·나이를 붙이고, 기록이 없거나 신뢰할 수 없으면 `unknown`이다. 외부 앱이 바꾼 로그인을 상태 파일만으로 검증했다고 주장하지 않는다.

첫 실행·빈 설정도 긴 오류 대신 다음 일을 보인다.

```text
$ has
HA Switch 0.2.0 · local dashboard
No saved profiles.
Add: has add codex work
Help: has --help
```

### list와 live usage

`has list`는 같은 빠른 local/cache 목록이다. `--usage`만 기존 usage adapter를 조회한다. 한 행의 실패가 전체 목록을 막지 않는다.

```text
$ has list claude --usage
Claude / default

#  NAME      SHARED HOME  5H LEFT  5H RESET  7D LEFT  7D RESET  CREDITS  STATUS
1  work      current      42%      in 2h     63%      in 3d     1        fresh
2  personal  —            18%      in 1h     51%      in 3d     ?        query failed · 18m ago

SOURCE
1  ~/.config/ha-switch/profiles/claude/work
2  ~/.claude-sample
```

stderr에는 묶인 경고 한 줄과 다음 명령만 쓴다.

```text
has: personal usage query failed (claude_usage_http_429); last value · 18m ago
Next: has run claude personal --isolated
```

값 0은 `0%`·`0`이다. 값 없음은 `?`다. 조회 실패는 `query failed`이며 이전 정상 값을 지우지 않는다. 캐시 나이·조회 오류·오래됨은 별개로 남긴다. 초기화 시각이 지난 cache를 새 값처럼 보이게 하지 않는다. 현재 계정을 읽지 못하면 `unknown`이고 미등록이라고 추측하지 않는다.

### shared run·isolated run

실행 배너는 stderr다. 본체 stdout과 종료 코드를 그대로 전달한다.

```text
$ has run codex
Selecting Codex account by usage policy...
Codex: using work (74% left, resets in 1h).
Starting Codex in shared home...
<native Codex UI>

$ has run claude -- --version
Claude: using the current shared home...
<native Claude version>

$ has run claude personal --isolated -- --version
Claude: starting isolated profile personal...
<native Claude version>
```

명시 Claude shared run이 Herdr 키체인에 막히면 같은 계정의 source 경로를 안내한다. 자동으로 격리 실행으로 바꾸지 않는다. 실행 범위는 사용자가 고른다.

```text
$ has run claude work
has: keychain_no_gui_session — Claude shared login cannot be checked in this pane
Next: has run claude work --isolated
```

이 오류에서 native 쓰기와 본체 실행은 0회여야 한다. 안내한 isolated 명령은 관리자의 키체인 읽기 없이 source 환경으로 실행돼야 한다. 본체 자체의 인증 성공은 별도 증거 없이는 주장하지 않는다.

### switch와 restore

```text
$ has switch codex work
Codex: switched the shared home to work.
Open Codex sessions keep their current login.
Previous selection: personal. To go back: has switch codex -

$ has restore codex
Codex: restored the first pre-switch login.
Next: has
```

`switch TOOL -`는 직전 선택이고 `restore TOOL`은 첫 전환 전 원본이다. 둘을 같은 복구라고 안내하지 않는다. 열린 본체가 메모리에 들고 있는 인증까지 바뀌었다고 말하지 않는다.

원본 restore 목표는 adapter마다 실제 백업 의미와 맞춰야 한다. Codex·Antigravity의 첫 백업과 Claude의 현 `switchTo` 백업 갱신 방식은 같지 않다. 이를 검증·정리하기 전 새 성공 문구만 먼저 붙여서는 안 된다.

### add

```text
$ has add codex work
Opening official Codex login for work...
<official login flow>
Codex: signed in and saved as work.
Run: has run codex work

$ has add claude personal
Opening official Claude login for personal...
<official login flow>
Claude: signed in and saved as personal.
Run: has run claude personal
```

Codex는 새 source에서 `codex login`, Claude는 새 source에서 `claude auth login`을 실행한다. 환경 변수로 주는 값은 source 경로다. 로그인 확인 뒤에만 설정에 등록한다. 본체 credential은 native 형식·native 저장소에 남긴다.

Claude 확인은 `claude auth status` 결과를 메모리에서 읽어 성공·인증 방법·config directory를 검증한다. 원시 응답은 stdout·로그·임시 파일에 내지 않는다. 다른 auth 환경이 source 로그인을 대신한 성공도 등록 근거로 삼지 않는다.

이미 등록된 이름과 source 충돌은 본체 로그인 전에 거부한다. cancel·실패는 기존 native 로그인과 config를 그대로 둔다. 새 source에 본체가 남긴 로그인 파일을 억지로 지우거나 logout을 호출하지 않는다. 등록되지 않은 새 source가 남으면 원인과 다음 재시도를 안내한다. 파일이 남았다는 사실과 설정 등록 성공은 다르다.

```text
has: add_login_failed — sign-in did not finish; profile was not registered
Next: has add codex work
```

Antigravity는 예외다. `has add agy personal`은 이미 공식 `agy`에서 로그인한 현재 keyring 계정을 capture한다. 새 격리 로그인 대행을 약속하지 않는다. 기존 `saveAgyConfiguration`·`captureAgyAccount` 경로와 충돌 거부를 유지한다.

## 7. 전체 도움말 전문

이 도움말은 목표 문안이다. 실제 `src/cli.ts`는 일부 문안만 옮긴 상태이고 parser와 동작은 아직 옛 것이다. 도움말은 패키지의 실제 판 값을 사용해야 한다.

```text
HA Switch 0.2.0
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
```

`-h`와 `--help`는 언제나 도움말이다. 도구 선택이나 dry-run으로 해석하지 않는다. 설정·키체인이 없어도 동작한다. `has -h c`도 도움말이며, 옛 하네스 선택으로 해석하지 않는다.

## 8. 출력·폭·색

stdout은 표·JSON·본체 데이터다. stderr는 진행·경고·오류다. 데이터에 배너나 로그를 섞지 않는다. UI는 영어 단문을 기본으로 한다.

표는 테두리 없이 열 제목과 공백으로 만든다. `Bun.stringWidth`로 표시 폭을 계산한다. `5H RESET`·`7D RESET`은 시각, `CREDITS`는 리셋 권 수다. 색만으로 상태를 설명하지 않는다.

Herdr의 약 112열 화면을 기본으로 하고 반으로 나눈 약 56열도 지원한다. 접는 순서는 SOURCE·PLAN부터, 다음은 주간 reset 시각이다. 5H reset 시각은 한도 0일 때 꼭 남긴다. 나머지 값은 행 아래 보조 줄이나 JSON에 남긴다. 긴 이름·경로·footer도 폭 안에서 접어야 한다.

```text
#  NAME      HOME  5H    RESET    7D    CR
1  work      *     74%   in 1h    61%   2
2  personal  —     0%    in 12m   18%   0
* last checked shared home · 4m ago
```

기본 색은 TTY에서만 켠다. 비어 있지 않은 `NO_COLOR` 또는 `--color never`이면 끈다. JSON·파이프는 기본 무색이다. `--color always`를 지원하더라도 `NO_COLOR`와의 우선순위는 문서·시험에서 같은 규칙으로 고정한다.

## 9. JSON 계약

`--json`은 dashboard/list용이다. stdout에 schemaVersion 1인 문서 하나만 낸다. 색·spinner·질문·실행 배너는 없다. 현재 설계는 run JSON을 지원하는 것이 아니다.

```json
{
  "schemaVersion": 1,
  "command": "list",
  "generatedAt": "2026-10-12T10:30:00.000Z",
  "accounts": [
    {
      "tool": "codex",
      "pool": "default",
      "number": 1,
      "name": "work",
      "source": "~/.config/ha-switch/profiles/codex/work",
      "current": true,
      "currentCheckedAt": "2026-10-12T10:26:00.000Z",
      "status": "fresh",
      "usage": {
        "fiveHourRemaining": 74,
        "fiveHourResetsAt": "2026-10-12T11:30:00.000Z",
        "weeklyRemaining": 61,
        "weeklyResetsAt": "2026-10-14T10:30:00.000Z"
      },
      "resetCredits": 2,
      "usageAgeSeconds": 240,
      "queryError": null
    }
  ],
  "warnings": []
}
```

`current`가 확인되지 않았으면 null이다. false는 확인한 결과 현재가 아니라는 뜻이다. 캐시만 읽은 기본 화면은 `currentCheckedAt`도 함께 둔다. isolated 실행을 shared current로 기록하지 않는다.

usage 상태는 `fresh`, `stale`, `unknown`, `query_failed`를 구분한다. 인증 상태인 `signed_out`, `available`, `limited`를 함께 표현한다면 JSON에서 이름과 우선순위를 문서와 맞춰야 한다. 마지막 정상 값이 있는 query failure는 그 값·나이와 `queryError`를 함께 준다. 0과 null은 다르다.

reset 시각은 ISO 문자열이다. 값이 없으면 null이다. source는 사용자가 설정한 프로필 경로이며 축약 전 절대 경로를 machine contract로 쓸지는 구현 때 한 규칙으로 고정한다. 토큰·실제 계정 ID·이메일·raw credential response를 넣지 않는다.

설정·옵션 오류도 JSON 한 문서로 낸다.

```json
{
  "schemaVersion": 1,
  "command": "list",
  "error": {
    "code": "pool_selection_required",
    "message": "choose one configured pool",
    "next": "has list codex --pool default --json"
  }
}
```

목록의 일부 usage 실패는 전체 실패가 아니므로 exit 0이다. 행 상태와 warnings에 실패를 남긴다. 설정 오류·잘못된 옵션·native 쓰기 실패는 non-zero다. 원래 설계에 있던 run 오류 JSON 예시는 list-only 지원 범위와 충돌하므로 인계 문서에서는 list 오류 예시로 바로잡았다.

## 10. 오류·종료 코드

오류 코드는 안정된 이름으로 남기고, 한 줄 원인과 `Next:` 명령을 붙인다. 알 수 없는 예외의 raw message를 출력하지 않는다. keychain의 실제 실패 이름을 `account_current_not_in_pool`로 바꾸지 않는다.

```text
has: account_selector_ambiguous — more than one profile matches
Candidates: work, work-extra
Next: has run codex work-extra
```

| 코드 | 뜻 |
| --- | --- |
| 0 | 성공. 목록의 일부 usage 조회 실패 포함 |
| 1 | 설정·인증·native 파일·keychain 등 작업 실패 |
| 2 | 잘못된 명령·옵션·selector, 모호한 선택, non-TTY에서 selector 누락 |
| 130 | 선택기나 로그인 취소 |

run은 본체가 시작됐으면 그 본체 종료 코드를 그대로 돌려준다. 본체를 열기도 전에 사용 오류·인증 오류가 나면 위 코드로 번역한다. 로그는 `[ha-switch:module:action]`, 기본 `warn`이며 비밀·계정 식별자를 쓰지 않는다.

## 11. 기존 설정 이행·옛 명령 제거

기존 `~/.config/ha-switch/{codex,claude,agy}-pools.json`을 그대로 읽는다. 새 표면을 쓰기 위해 손 편집이나 init을 요구하지 않는다. 저장된 pool args와 selection 정책을 유지한다.

폴더가 label인 설정도 그대로 읽는다. 합성 `.codex-sample1`은 표에 저장된 이름으로 보이고 유일한 조각 `sample1`로 선택할 수 있다. 별도의 rename·alias 명령은 이번에 만들지 않는다. 실제 사용자의 label을 문서·시험 데이터로 옮기지 않는다.

retired pool home은 매 실행의 `pool_home_retired`로 막지 않는다. 공유 실행은 native target, isolated 실행은 source 경로로 푼다. 설정 자체를 실제 홈에서 자동 재작성하지 않는다. 백업으로 옮긴 native source와 공유 target의 분리를 유지한다.

| 옛 입력 | 새 입력·안내 |
| --- | --- |
| `has x` | `has run codex` |
| `has c` | `has run claude` |
| `has x -s 2` | `has run codex 2` |
| `has c -s 2` | `has run claude 2` |
| `has -h c` | `has list claude`; `-h` 자체는 항상 도움말 |
| `has -h c -s 2` | `has switch claude 2`; 이 옛 입력의 `-h`는 도움말로 끝남 |
| `has -s 2`, `has --switch 2` | `has switch codex 2` |
| `has -c a personal`, `has save agy personal` | `has add agy personal`, 먼저 본체에 로그인 |
| `has --list`, `has --list --local` | `has list` |
| `has run TOOL --account 2` | `has run TOOL 2` |
| HA-2 source 전용 `has run TOOL NAME` | `has run TOOL NAME --isolated` |
| 도구 없는 `has switch 2` | `has switch codex 2` |
| 도구 없는 `has restore` | `has restore codex` |
| `pool_home_retired` | source/native target 분리로 처리. 매 실행의 오류 표면에서 제거 |

옛 최상위 명령과 flag는 native 상태를 건드리지 않고 새 명령 한 줄을 알려 준 뒤 끝낸다. 새 하위 호환 경로를 계속 늘리지 않는다. init/import/sync 같은 유지보수 경로는 최종 parser에서 명시적으로 결정해야 한다. 일상 도움말의 다섯 명령과 다시 섞지 않는다.

예전 별칭처럼 가벼운 줄은 제안만 한다. `.zshenv`를 직접 고치지 않는다. 실제 프로필에 맞춘 이름·번호는 사용자가 고른다.

```zsh
alias codex-auto='has run codex'
alias claude-current='has run claude'
alias claude-work='has run claude work --isolated --'
```

## 12. 안전장치와 구현 순서

원본 adapter의 검증·token 되돌려쓰기·계정 혼합 거부·첫 백업·restore·쓰기 전 재확인·원자적 교체·rollback을 유지한다. Codex usage는 native app-server다. Claude·Antigravity 저장 계정은 macOS keychain이다. custom vault나 토큰 환경 변수는 만들지 않는다.

1. parser와 help를 새 문법으로 함께 바꾼다. 도움말에만 있는 옵션을 남기지 않는다. `-h`는 항상 help다.
2. selector의 exact/number/unique fragment/previous를 연결한다. TTY와 non-TTY, 취소, 후보 충돌을 분리한다.
3. shared run은 기존 native adapters, isolated run은 profile 환경만 쓰게 분리한다. 기존 Codex selection 정책과 args assembler를 유지한다.
4. local dashboard와 list는 설정·안전한 cache만 읽는다. live usage는 명시 옵션이다. credentials 읽기·쓰기나 sync를 목록에 끼우지 않는다.
5. usage cache는 허용한 값·시각·safe error code만 저장한다. 실패해도 마지막 정상 값을 보존하고 자동 선택에는 재사용하지 않는다.
6. shared 선택 이력을 성공 후에만 기록한다. state 파일은 current 인증 증명이 아니다. 쓰기 실패·동시 변경을 감지한다.
7. add는 label/source/config 충돌을 공식 로그인 전에 확인하고 성공·인증 경로 확인 뒤 원자 등록한다. 쓰기 직전 설정을 다시 확인한다.
8. source/native target 분리와 restore 의미를 adapter별로 검증한다. 열린 세션까지 바뀌었다고 말하지 않는다.
9. README.md, README.ko.md, CHANGELOG.md, `skills/has/SKILL.md`·JSON을 새 계약과 맞춘다. 저장소 Markdown에는 front matter를 넣지 않는다.
10. 가짜 keychain·합성 credentials·임시 HOME·가짜 CLI로 시험한다. `bun run format` 뒤 `bun run check`를 한다. 새 Herdr 셸과 임시 패키지로 smoke를 남긴다.
11. 결과를 커밋·push하고 통제 세션에 보고한다. 태그·릴리스·전역 교체는 이 작업에 넣지 않는다.

## 13. 합격 기준

- 무인자 `has`가 한 화면을 내고 끝난다. 키체인·네트워크·native 쓰기는 0회다.
- `has list`도 credential adapter 없이 기존 설정을 읽는다.
- `has run codex`가 기존 selection 정책으로 live usage를 읽어 공유 홈에서 한 번에 연다.
- 명시 selector는 사용량 조회 없이 검증·선택할 수 있다.
- `has run claude`가 관리자 키체인 조회 없이 현재 shared 본체를 연다.
- `has run claude work`의 keychain 실패는 같은 이름의 `--isolated` Next를 내고 쓰기·실행은 0회다.
- 안내된 `has run claude work --isolated`는 관리자 keychain을 읽지 않고 source로 실행한다.
- 두 isolated run을 동시에 시작해 환경과 args를 구분하고 native 원본을 바꾸지 않는다.
- 0·unknown·stale·query failure, reset 시각·리셋 권 수를 구분한다.
- 좁은 56열·기본 112열, NO_COLOR·non-TTY·JSON에서 레이아웃과 데이터 계약이 맞다.
- JSON stdout은 문서 하나이고 token·계정 ID·이메일·raw credential response가 없다.
- add 취소·실패·중복·config 경합은 기존 native 로그인과 설정을 보존한다.
- 전환·restore는 freshness·backup·recheck·권한 보존 시험을 통과한다.
- `source ~/.zshenv`는 출력 없이 끝난다. 파일은 수정하지 않는다.

가짜 CLI의 `--version` 성공은 실행 경로·환경 전달의 증거다. 실제 계정의 본체 인증이나 전환 성공 증거가 아니다.

## 14. 자기 검토·plug-hole 검토 반영

첫 설계 뒤 처음 쓰는 사람의 눈으로 다시 읽었다. 같은 일을 하는 여러 입력, current의 뜻, 값을 못 읽었을 때의 다음 행동을 고쳤다.

### 처음 고친 것

- `-h`를 하네스 선택에서 표준 도움말로 돌렸다.
- bare 전체 화면 TUI 대신 한 번 출력하는 대시보드를 골랐다.
- 기본 목록에서 keychain과 live usage를 뺐다. 오류가 있어도 계정별 실행 경로를 알 수 있게 했다.
- 숫자뿐 아니라 이름·유일 조각·직전 선택을 설계했다.
- stdout과 stderr, JSON과 사람용 화면의 경계를 고정했다.

### plug-hole의 필수 검토 네 가지

1. **공유 홈에서 자동 골라 열기**: 첫 설계에 빠졌던 매일 쓰는 일을 기획 표에 추가했다. `has run codex`는 live usage 기반 자동 선택·전환·실행이고 source 실행은 `--isolated`다.
2. **풀 args·승인 생략**: 기존 풀 args와 bypass 기본값을 run에 유지했다. `--safe`가 무엇을 빼는지 설계에 명시했다.
3. **기존 설정**: 기존 폴더 label·from·selection 정책을 그대로 읽는다. 손 편집·init을 요구하지 않는다. fragment 선택으로 긴 label을 줄여 쓸 수 있다.
4. **reset 시각**: `RESET` 한 열을 `5H RESET`·`7D RESET`과 `CREDITS`로 갈랐다. 사람 화면은 상대 시각, JSON은 ISO 시각이다.

### plug-hole의 권고 네 가지

5. TOOL 자리의 `x`·`c`·`a`를 허용했다. 최상위 옛 shortcut과는 다른 위치다.
6. `switch -`의 직전 선택과 restore의 첫 원본을 한 문장으로 갈랐다. 성공 안내에서 둘을 같은 `or` 경로로 권하지 않는다.
7. CURRENT가 shared native 홈 기준임을 열 제목과 범례로 드러냈다. isolated session을 여기에 합치지 않는다.
8. Herdr 112열과 분할 56열의 접는 순서를 정했다. SOURCE부터 접고 5H reset 시각을 남긴다.

### 추가 메모

명시 Claude shared run의 `keychain_no_gui_session` 오류에 같은 이름의 `has run claude NAME --isolated`를 Next로 쓴다. 해당 실패와 isolated 성공을 한 시험 흐름에 넣는다. 검토 주체는 문서 어디서도 오너 검토라고 부르지 않고 **plug-hole 세션 검토**로 남긴다.

복원 때 원본의 남은 표현 충돌도 드러냈다. 기본 화면은 live current를 검증하지 않으므로 마지막 확인 시각을 보여야 한다. JSON은 list-only라고 한 계약과 run JSON 예시가 충돌해 list 예시로 맞췄다. 원본의 첫 restore 약속은 Claude adapter의 실제 backup 갱신 방식과 맞추는 작업이 남아 있다. 이 정리는 새 구현이 아니라 인계 문서의 정확성 보완이다.

## 15. 구현 진행 상태와 남은 일

2026-10-13에 현재 Git와 코드만 읽어 확인했다. 이 문서 복원 턴에서 구현을 하지 않았다.

### 완료 근거

- HA-2: `fix/ha-2-profile-launch`, `3e2e978`. source 프로필 직접 실행과 credential 없는 기본 목록이 들어 있었다.
- HA-2 기준으로 실행한 `bun run check`: 175 pass, 0 fail, 1187 assertions. **HA-3 변경 전에 한 검사**다.
- HA-3: 사용성·웹 조사, 기획, CLI 디자인, plug-hole 검토 반영을 마쳤다. 설계 보고를 Herdr `wC:p1`로 보냈다.
- HA-3 구현 중간본: `wip/ha-3-20261013`, `0199153`. 9개 source 파일, 500줄 추가·44줄 삭제를 보관한 WIP 커밋이다. 완성·검사 통과를 뜻하지 않는다.

### 0199153에 들어 있는 것

| 파일 | 들어 있는 중간 작업 | 남은 연결·검증 |
| --- | --- | --- |
| `src/cli.ts` | 새 도움말, 새 모듈 import, login dependency 타입 | 실제 parser·main은 옛 흐름. 새 command·옵션·dependency 연결 필요 |
| `src/account-table.ts` | dashboard renderer, row JSON, query 실패 시 값 표시 일부 | 폭·source·current unknown/age·색·오류 계약·CLI 연결 필요 |
| `src/add.ts` | 공식 login runner, source 만들기, 성공 뒤 append 골격 | 로그인 전 충돌 거부, Claude 응답 비공개 검증, 실패 복구, agy 연결 필요 |
| `src/config.ts` | appendProfile 골격 | 처음 읽은 설정과 쓰기 직전 비교, 경합·권한·중복 시험 필요 |
| `src/profile-launch.ts` | configuredSelector wrapper | 새 parser에서 selector·isolated 실행 연결 필요 |
| `src/selection.ts` | 번호·exact·fragment·previous 해석 | TTY 후보 선택·취소·non-TTY 오류 연결 필요 |
| `src/state.ts` | current/previous 기록 골격 | 성공 시점 연결, 첫 current·외부 변경·경합·권한 검증 필요 |
| `src/types.ts` | usageFetchedAt·usageStale 필드 | cache/표/JSON 의미 일치 필요 |
| `src/usage-cache.ts` | read/apply/save 골격 | 데이터 검증·allowlist·오류 보존·원자성·자동 선택 제외·CLI 연결 필요 |

### 코드에서 확인한 미완성 지점

- help에 있는 add·isolated·JSON·색·새 `-h`가 실제 parser와 아직 맞지 않는다. 새 모듈은 import돼도 main 경로에 연결되지 않았다.
- `CliDependencies.login`이 추가됐지만 기본 dependencies 객체에 `login` 연결이 없다. 타입 검사부터 마무리해야 한다.
- add의 중복 label 검사가 append 단계라 로그인 전에 거부하지 못한다. 이미 존재하는 source도 먼저 막아야 한다.
- Claude auth status runner는 현재 stdout을 그대로 상속한다. raw 응답이 나올 수 있어 pipe로 읽고 필요한 값만 검증하는 경계가 필요하다.
- appendProfile은 처음 읽은 설정과 최종 rename 직전의 비교를 아직 보장하지 않는다. 다른 프로세스의 변경을 덮지 않도록 고쳐야 한다.
- state/cache reader는 unknown JSON을 충분히 검증하지 않고 쓰기 경합 처리도 부족하다. 안전한 schema·허용 필드·오류 로그를 넣어야 한다.
- cache cleanup에 조용한 catch가 남아 있다. 원래 실패와 cleanup 실패를 보존하는 저장소 규칙에 맞춰야 한다.
- dashboard current가 읽지 못한 상태를 `—`로 내거나 stored selection을 live current처럼 보이지 않도록 고쳐야 한다.
- accountJson에는 목표 source·safe error·current 확인 시각이 빠져 있고 좁은 폭 옵션도 없다.
- HA-3 시험·README 두 언어·CHANGELOG·skills 갱신은 하지 못했다. 기존 HA-2/shortcut 시험도 새 문법에 맞춰 유지할 안전 증거와 퇴역 UX를 나눠 고쳐야 한다.
- native 로그인 백업의 첫 원본/직전 의미, Codex shared source archive와 isolated source의 관계는 그대로 검증해야 한다.

### 다음 담당자의 순서

1. 이 문서, `AGENTS.md`, 현재 Git 상태와 `0199153` diff를 읽는다. 다른 작업자의 변경을 보존한다.
2. source 안전 경계를 먼저 마무리한다: add preflight·상태 응답 비공개·config 재확인·원자 쓰기·cache/state schema.
3. parser·main에 새 command/selector/TTY/dependency를 연결한다. 기존 shared 자동 선택·args·safe를 유지하고 isolated 경로를 분리한다.
4. renderer·JSON·current 시각·사용량 실패·reset 시각·폭·색을 계약과 맞춘다.
5. 가짜 keychain·임시 HOME·가짜 binaries로 meaningful 시험을 쓴다. 특히 Claude shared 실패 → isolated Next → source 실행을 검증한다.
6. README 두 언어·CHANGELOG·`skills/has`를 갱신한다.
7. `bun run format`, `bun run check`, 임시 패키지와 Herdr 새 셸 smoke를 한다. actual auth/switch 시험은 하지 않는다.
8. 커밋·push 후 plug-hole에 브랜치·해시·새 help·합성 목록·직접 확인/미확인을 보고한다.

### 중단·인계 기록

- 이유: 오너 승인으로 남은 주간 한도를 아끼고 Claude 세션에 구현을 넘긴다.
- 완료: 조사·검토 반영 설계·중간 source 보존.
- 마지막 전체 검사: `3e2e978`의 HA-2 상태에서 175 pass. `0199153`의 HA-3 완성 검사 증거는 없다.
- 현재 브랜치: `wip/ha-3-20261013`.
- 중간 구현 커밋: `0199153`.
- 이번 턴의 변경 범위: `docs/ha-3-design.md`, `docs/ha-3-competitors.md` 두 문서뿐.
- 금지 유지: 실제 계정·이메일·토큰 출력, 실제 로그인 전환 시험, 실제 설정·`.zshenv` 수정, 릴리스·태그·전역 설치 교체.
- 다음 행동: Claude 세션이 위 순서로 구현과 검증을 마무리한다. 이 Codex 세션은 문서 push와 커밋 해시 보고 뒤 멈춘다.

## 16. 구현 결정 기록 (2026-10-13, Claude 세션)

HA-4 인계에 따라 이 문서를 정본으로 구현을 마쳤다. 설계와 다르게 정하거나 설계가 비워 둔 곳을 채운 결정만 적는다. 화면 값은 모두 합성 데이터다.

- **유지보수 명령**: `init`과 `import --from DIR`은 남기되 일상 도움말의 다섯 명령과 섞지 않고 Notes 끝 한 줄로만 적었다. `sync`와 `save`는 퇴역시켰다. 저장 로그인 동기화는 전환 전에 이미 수행되므로 별도 명령이 필요 없다.
- **`--safe`의 뜻**: 설계대로 풀 `args`와 승인 생략 플래그를 모두 뺀다. 기존 `shortcutArguments`는 플래그만 빼므로 CLI가 풀 `args`를 빈 배열로 넘겨 설계 약속을 지켰다. 공유 run과 isolated run에 같은 정책을 적용했고, HA-2의 "source run은 플래그 없음" 동작은 설계대로 폐기했다.
- **공유 대상**: Codex 공유 run·switch·restore는 풀 `home`과 무관하게 `~/.codex`를 대상으로 한다(`nativeCodexPool`). Claude는 `~/.claude`를 대상으로 하고 풀 `home`이 `.claude`가 아니면 `nativeBackup`으로 별도 백업 서비스를 쓴다. `pool_home_retired` 오류는 제거했다.
- **Claude 백업 의미**: `switchTo`가 매 전환마다 백업을 덮어쓰던 것을 "백업이 비어 있을 때만 쓴다"로 바꿔 Codex·Antigravity와 같은 첫 전환 전 원본이 되게 했다. `restore claude` 문구가 설계 문구와 일치한다.
- **직전 선택 seed**: 상태 파일에 기록이 없던 첫 전환에서도 `switch -`가 동작하도록 Codex는 전환 직전 `listNativeCodex`(auth.json 파일 읽기, 키체인 없음)의 current를 `previous`로 기록한다. Claude·Antigravity는 키체인 읽기가 필요하므로 상태 파일 기록만 쓴다.
- **SHARED HOME 열**: 설계의 `current`에 확인 나이를 붙여 `current · 4m ago`로 표시한다. 기본 화면은 live 확인이 아니므로 시각을 함께 보여야 한다는 설계 원칙을 따랐다. 좁은 폭에서는 `*`와 각주로 접는다.
- **상태 이름과 우선순위**: 한 `status` 값에 `query_failed > signed_out > stale > limited > fresh > unknown` 순으로 정했다. `credentialError`가 있으면 `unknown`이고 경고로 따로 낸다. JSON `queryError`에는 usage 조회 오류 또는 credential 오류 코드가 들어간다.
- **JSON `source`**: 축약 없는 절대 경로를 기계 계약으로 고정했다. 사람용 표의 SOURCE 블록만 `~`로 줄인다. 키체인에만 있는 Claude 계정과 Antigravity는 `null`이다.
- **선택기 취소 키**: `q`, 빈 입력 뒤 Enter, Ctrl-C, Ctrl-D를 취소로 처리한다. Esc 단독 입력은 readline 줄 입력에서 구분할 수 없어 지원하지 않았다. 잘못된 답은 세 번까지 다시 묻고 그 뒤 `selector_required`로 끝낸다.
- **`add claude` 검증**: `claude auth status --json`을 stdout pipe로 메모리에서 읽어 `loggedIn === true`, `authMethod === "claude.ai"`, `configDirectory`가 새 source와 같은지만 확인한다. 공식 문서에 따라 `configDirectory`는 Claude Code 2.1.268 이상에서만 나오므로 그보다 오래된 본체에서는 `add_login_unverified`가 난다. 원시 응답은 출력·로그·파일에 남기지 않는다.
- **`add` 실패 복구**: 로그인 종료 코드 130은 `cancelled`(130), 그 밖의 비정상 종료는 `add_login_failed`(1)다. 새 source 폴더는 지우지 않고 남겨 재시도에 쓰게 했다. 이미 비어 있지 않은 source 폴더는 `account_source_exists`로 로그인 전에 거부한다.
- **사용량 캐시 stale 규칙**: 조회 시각이 1시간을 넘었거나, 조회 뒤 창의 초기화 시각이 지났으면 `stale`이다. 캐시는 대시보드와 목록 표시에만 쓰고 자동 선택에는 live 값만 쓴다.
- **`list --usage`의 상태 기록**: credential 오류가 없을 때만 `checked`로 current를 기록한다. Codex `list --usage`는 더 이상 `syncCodex`를 호출하지 않는다.
- **색 우선순위**: `--color never` > `--color always` > 비어 있지 않은 `NO_COLOR` > TTY 자동. JSON은 언제나 무색.
- **종료 코드 2 범위**: 잘못된 명령·옵션·선택자, 모호한 선택, non-TTY 선택자 누락, 퇴역 명령·옵션, `pool_selection_required`, `pool_unknown`, `isolated_not_supported`. 나머지 실패는 1이다.
