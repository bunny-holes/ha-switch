# HA-3 경쟁 도구·CLI 조사 복원

조사일: 2026-10-12. 복원일: 2026-10-13.

사라진 `/private/tmp/ha-switch-HA-3-competitors.md`와 CLI 조사 보고서를 대화에 남은 내용으로 복원했다. 당시 웹에서 README·도움말·화면 링크·이슈를 열었지만 이번 문서 복원에서는 새 조사를 하지 않았다. 기능·이슈 상태는 당시 관찰이고 현재 판에서 같다고 보장하지 않는다. 경쟁 도구를 설치하거나 실제 인증·전환을 시험하지 않았다.

계정 이름은 합성 예시이며 실제 계정·이메일·토큰을 포함하지 않는다. 최종 설계·진행 상태는 [ha-3-design.md](ha-3-design.md)에 있다.

## 1. 계정 전환 CLI 비교

### realiti4/claude-swap

출처:

- [README](https://github.com/realiti4/claude-swap)
- [README 원문](https://raw.githubusercontent.com/realiti4/claude-swap/main/README.md)
- [dashboard 화면](https://raw.githubusercontent.com/realiti4/claude-swap/main/assets/tui-watch.png)

관찰: 무인자 `cswap`은 전체 화면 TUI다. `list`는 5시간·7일 usage와 reset을 보인다. `add`는 현재 본체 로그인을 저장한다. `switch`는 인자 없이 다음 계정 또는 번호·별칭 등으로 고른다. `run`은 한 터미널의 계정 세션을 열고 다른 터미널과 나란히 쓸 수 있게 한다. 자동 전환의 임계값·쿨다운·전략, 캐시 usage 나이, JSON 출력도 문서화돼 있었다.

혼동·위험 근거:

- [#390](https://github.com/realiti4/claude-swap/issues/390): Herdr 같은 멀티플렉서에서 TUI 마우스 포획 문제.
- [#376](https://github.com/realiti4/claude-swap/issues/376): 오래된 usage가 현재 값처럼 보이고 reset 상대값이 부정확한 문제.
- [#337](https://github.com/realiti4/claude-swap/issues/337): run 배너가 stdout의 stream JSON을 깨뜨리는 문제.
- [#419](https://github.com/realiti4/claude-swap/issues/419): 임시 파일 생성·chmod 시점의 권한 문제.

ha-switch 결정: bare 전체 화면 TUI는 쓰지 않는다. 마지막 값에 나이·stale·조회 실패를 붙인다. run 배너는 stderr다. 원자 교체 전 임시 파일부터 안전한 mode로 만들고 cleanup 실패도 보존한다. 자동 선택 기능은 기존 것을 지키되 cache 실패값으로 고르지 않는다.

### Loongphy/codex-auth

출처:

- [README](https://github.com/Loongphy/codex-auth)
- [switch 도움말](https://github.com/Loongphy/codex-auth/blob/main/docs/commands/switch.md)
- [list 도움말](https://github.com/Loongphy/codex-auth/blob/main/docs/commands/list.md)
- [JSON 계약](https://github.com/Loongphy/codex-auth/blob/main/docs/json-api.md)

관찰: `login`이 공식 `codex login`을 대행한 뒤 등록한다. `switch`는 무인자 TTY 선택기와 직접 selector를 제공한다. 번호·별칭·이름 조각, `switch -` 직전 복귀를 문서화했다. 후보가 여럿이고 TTY가 아니거나 JSON이면 후보를 오류로 낸다. usage cache와 이번 조회를 구분하며 실패한 조회가 기존 snapshot을 지우지 않는다. JSON은 schema 버전·한 stdout 문서·stderr 진단·종료 코드를 명시했다.

혼동·위험 근거:

- [#162](https://github.com/Loongphy/codex-auth/issues/162): 전환 뒤에도 열린 app-server가 옛 인증을 기억하는 문제.
- [#158](https://github.com/Loongphy/codex-auth/issues/158): 공용 active 파일이 다른 터미널의 계정과 동시 실행을 방해하는 문제.
- README의 로컬 usage 설명은 최신 본체의 rate-limit 기록이 비거나 오래될 수 있음을 다뤘다. 파일에 값이 있다는 것만으로 live usage라고 하면 안 된다.

ha-switch 결정: 공식 본체 로그인 대행, 유일 selector·직전·TTY 규칙, 버전 있는 JSON을 가져온다. usage는 기존 native app-server 경로를 지킨다. native 파일 전환 성공을 열린 세션 인증 성공으로 말하지 않는다. 병렬 계정 실행은 `--isolated`로 명시한다.

### uwuclxdy/clauth

출처:

- [README](https://github.com/uwuclxdy/clauth)
- [당시 README 원문](https://raw.githubusercontent.com/uwuclxdy/clauth/mommy/README.md)
- [화면](https://raw.githubusercontent.com/uwuclxdy/clauth/mommy/media/clauth.png)
- [demo GIF](https://raw.githubusercontent.com/uwuclxdy/clauth/mommy/media/demo.gif)

관찰: 무인자 TUI, 이름 전환, `capture`·`login` 등록, `start` 격리 실행, `list`·`which`의 캐시 표를 제공했다. 별도 `CLAUDE_CONFIG_DIR`은 병렬 실행의 근거다. 표는 active 상태와 cached usage를 보이고 TUI는 키보드 조작을 안내했다.

혼동 근거:

- [#114](https://github.com/uwuclxdy/clauth/issues/114): 도구별 프로필이 start/switch/delete의 Tab 완성에서 빠지는 문제.
- [#115](https://github.com/uwuclxdy/clauth/issues/115): 없는 fallback 이름의 오류를 usage 부족으로 설명하는 문제.

ha-switch 결정: 이름과 도구의 명령 위치를 일관되게 한다. selector 없음·usage 없음·credential 실패를 같은 오류로 번역하지 않는다. full-screen TUI는 bare 기본으로 두지 않는다. 프로필 실행의 경계는 설명하되 설정·MCP 공유를 자동으로 약속하지 않는다.

### Dicklesworthstone/coding_agent_account_manager (caam)

출처:

- [README](https://github.com/Dicklesworthstone/coding_agent_account_manager)
- [README 원문](https://raw.githubusercontent.com/Dicklesworthstone/coding_agent_account_manager/main/README.md)

관찰: `backup`·`activate`로 여러 도구의 저장·전환을 다룬다. `pick`은 fzf가 있으면 fzf, 없으면 번호 입력이고 TTY가 없으면 직접 명령을 안내한다. 별칭, 격리 profile, JSON, robot docs/schema, passive validation, 원본 복구 경로가 있었다. 단순 전환·격리 profile·전체 HOME을 얕게 복제하는 모드 등 기능은 ha-switch보다 넓다.

위험 근거:

- [#19](https://github.com/Dicklesworthstone/coding_agent_account_manager/issues/19): 오래된 Codex refresh token을 복구해 계정이 서버에서 거부된 사고.
- [#69](https://github.com/Dicklesworthstone/coding_agent_account_manager/issues/69): HOME/XDG 격리가 다른 CLI 인증을 숨겨 git 오류로 드러난 문제.

ha-switch 결정: 사전 검증·원본 보관·freshness·쓰기 재확인을 유지한다. fzf는 optional이고 번호 선택이 기본이다. 전체 HOME·다른 도구 credential을 건드리는 복제나 custom vault를 도입하지 않는다. JSON에 계정 credential 원문을 넣지 않는다.

### Nemo-Illusionist/claude-code-account-switcher

출처:

- [README](https://github.com/Nemo-Illusionist/claude-code-account-switcher)
- [당시 README 원문](https://raw.githubusercontent.com/Nemo-Illusionist/claude-code-account-switcher/master/README.md)

관찰: `claude-acc add NAME`이 본체 로그인까지 열고, `link NAME`으로 디렉터리에 계정을 묶는다. `cd` 때 `CLAUDE_CONFIG_DIR`이 정해져 여러 터미널에서 나란히 실행할 수 있다. 계정 하나는 설정·기록·플러그인·MCP까지 담은 디렉터리다. list/status/usage/run/doctor 등은 각각의 목적을 드러낸다.

혼동 근거:

- [#144](https://github.com/Nemo-Illusionist/claude-code-account-switcher/issues/144): profile의 MCP 설정이 복사되지 않아 조용히 갈라진 문제.
- [#143](https://github.com/Nemo-Illusionist/claude-code-account-switcher/issues/143): 좁은 터미널 상태 줄이 잘리는 문제.
- [#151](https://github.com/Nemo-Illusionist/claude-code-account-switcher/issues/151): secure storage 설정이 계정을 한 인증으로 합칠 수 있는 문제.

ha-switch 결정: source 환경으로 실행하는 가벼운 경로를 유지한다. 자동 셸 hook·디렉터리 바인딩·MCP 복제는 이번 범위에 넣지 않는다. 56열에서도 읽히는 화면을 설계하고, 디렉터리 선택만으로 모든 인증 방식의 격리를 증명했다고 말하지 않는다.

## 2. 성숙한 CLI의 관례

| 자료 | 조사에서 본 패턴 | ha-switch 판단 |
| --- | --- | --- |
| [gh auth switch](https://cli.github.com/manual/gh_auth_switch), [status](https://cli.github.com/manual/gh_auth_status) | 조회와 전환 분리, 모호하면 명시 입력·TTY 선택 | list와 switch를 분리. 후보를 임의로 고르지 않음 |
| [gcloud configurations](https://docs.cloud.google.com/sdk/gcloud/reference/config/configurations) | list/create/activate와 일회성 configuration | 등록·조회·전역 변경·한 프로세스 실행의 범위 표시 |
| [AWS profiles](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-files.html) | named profile과 명령별 `--profile` | isolated 옵션의 범위를 이름으로 드러냄 |
| [aws-vault](https://github.com/99designs/aws-vault) | native credential store와 명령 실행 wrapper | custom vault를 새로 만들지 않고 native 경계 유지 |
| [kubectl use-context](https://kubernetes.io/docs/reference/kubectl/generated/kubectl_config/kubectl_config_use-context/), [kubectx](https://github.com/ahmetb/kubectx) | 이름 선택, 직전 `-`, optional fzf | 번호·이름·직전, TTY만 질문 |
| [nvm](https://github.com/nvm-sh/nvm), [fnm](https://github.com/Schniz/fnm), [mise](https://mise.jdx.dev/cli/exec) | 기본 선택과 프로세스별 실행을 구분 | shared run과 isolated run의 차이를 명시 |
| [git switch](https://git-scm.com/docs/git-switch) | `-` 직전 복귀, 생성/전환을 명시 | `switch -`와 restore 백업을 구분 |

aws-vault의 세부 옵션·에러 출력은 이 세션 컨텍스트에 독립적인 조사 근거가 충분히 남지 않았다. 위 표는 프로젝트의 큰 역할만 참고하며 해당 세부 구현을 재현했다고 주장하지 않는다.

## 3. CLI 지침·출력·선택기

- [clig.dev](https://clig.dev/): 도움말에 예시, `-h`·`--help`, stdout 데이터/stderr 진단, JSON, TTY에만 질문, 오류의 다음 명령, 의미 있는 종료 코드.
- [12 Factor CLI Apps](https://jdxcode.medium.com/12-factor-cli-apps-dd3c227a0e46): 여러 명령이 같은 관례를 쓰고 CLI를 스크립트와도 함께 쓸 수 있어야 한다. bare 대시보드는 이 작은 도구에 맞춘 선택이다.
- [Heroku CLI style](https://devcenter.heroku.com/articles/cli-style-guide): 사람이 먼저인 표와 짧은 action 결과, 일관된 명령 명명, JSON과 진단 분리, 불필요한 의존성 경계.
- [GNU CLI](https://www.gnu.org/prep/standards/html_node/Command_002dLine-Interfaces.html), [POSIX utilities](https://pubs.opengroup.org/onlinepubs/9699919799/utilities/V3_chap01.html): 표준 옵션·도움말 관례. `-h`를 도구 선택에 쓰지 않는다.
- [NO_COLOR](https://no-color.org/): 비어 있지 않은 환경 설정이면 색을 끈다. 색 없이도 상태 의미가 남아야 한다.
- [fzf](https://github.com/junegunn/fzf): stdin 목록→선택 결과 패턴. Enter 확정과 cancel을 처리하고 optional 실행 파일로만 둔다.

계약은 표/JSON stdout, 진행/원인/다음 행동 stderr, 0 성공·1 작업 실패·2 사용 오류·130 취소다. 자식 본체는 자기 종료 코드를 유지한다. JSON은 schemaVersion 1인 한 문서이고 토큰·실제 계정 ID·이메일·raw credential response가 없다.

## 4. 공식 인증 문서 조사 요약

- [Codex CLI](https://learn.chatgpt.com/docs/codex/cli), [공식 source](https://github.com/openai/codex): 공식 본체 로그인과 profile home을 재사용한다. 사용량은 기존 app-server 경로다. usage 읽으려고 모델 요청을 시작하지 않는다.
- [Claude 인증](https://code.claude.com/docs/en/authentication), [환경 변수](https://code.claude.com/docs/ko/env-vars), [CLI reference](https://code.claude.com/docs/en/cli-reference): `CLAUDE_CONFIG_DIR`로 계정별 설정·기록을 고르고 `auth login`·`auth status`로 공식 로그인과 확인을 한다. 원시 status 응답은 ha-switch 밖으로 출력하지 않는다. 인증 방법에 따라 저장 위치·우선순위가 다르므로 path만으로 모든 계정 격리를 약속하지 않는다.
- [Antigravity 설치·인증](https://www.antigravity.google/docs/cli/install/), [reference](https://antigravity.google/docs/cli/reference/): native keyring과 본체 브라우저 로그인, `/logout`을 확인했다. 문서화되지 않은 격리 로그인 대행을 만들지 않는다. add는 현재 로그인 capture로 유지한다.

이 조사에서 Claude usage endpoint의 공개 공식 계약까지 증명한 것은 아니다. ha-switch의 기존 adapter를 재사용할 계획과 공식 본체 인증 문서의 증거는 구분한다.

## 5. 최종 ha-switch 결정

1. bare `has`는 전체 화면 TUI가 아닌 한 번 출력하는 local/cache 대시보드다. keychain·network는 읽지 않는다.
2. 일상 명령은 run/list/switch/add/restore 다섯 개다. `-h`는 help, 도구는 명령 뒤 TOOL 자리다.
3. plug-hole 검토 뒤 `run` 기본값을 shared 선택·전환·실행으로 정했다. Codex selector 생략은 기존 usage 정책 자동 선택, Claude selector 생략은 keychain 조회 없이 현재 shared 홈 실행이다.
4. `run --isolated`만 source 환경으로 실행한다. 전체 HOME·설정·MCP를 자동으로 복제하지 않는다.
5. old pool args·selection과 승인 생략 기본값을 지킨다. `--safe`를 명시하고 기존 label을 손 편집 없이 읽는다.
6. 번호·이름·유일 조각·직전 `-`를 받는다. non-TTY·JSON에서 질문하지 않고 후보·다음 명령을 낸다.
7. 잔량 0·unknown·stale·query failure를 구분하고 reset 시각과 리셋 권 수를 따로 보인다. cache는 자동 선택의 근거로 쓰지 않는다.
8. current는 shared native 홈의 마지막 확인이다. isolated 세션은 별개다. 기본 local 화면이 live 인증을 확인했다고 말하지 않는다.
9. shared Claude named run이 Herdr keychain에 막히면 `Next: has run claude NAME --isolated`를 낸다. silent fallback은 하지 않는다.
10. 실제 성공 증거와 문서 기능을 구분한다. source 중간본은 `0199153`에 보관됐으며, parser 연결·시험·문서/스킬 갱신이 남아 있다.

이 결과는 조사와 설계다. 실제 본체 인증·계정 전환·배포가 끝났다는 보고가 아니다.
