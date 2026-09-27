# 구현 진행 기록

기능 구현을 여러 세션·에이전트가 나눠 진행할 때 중복 작업을 막기 위한 문서다.
새 세션은 `README.md`, `docs/PROJECT.md`, `docs/DECISIONS.md`를 읽은 뒤 이 문서를 읽고,
**"작업 목록"에서 상태가 `대기`인 항목부터** 이어서 진행한다.
작업을 시작하거나 끝내면 이 문서의 상태와 "작업 로그"를 갱신한다.

## 근거가 되는 결정

- D003 주 API: USNO celnav (`zn` 방위각, `hc` 고도), 교차 검증: JPL Horizons (필요할 때만)
- D004·D005 호출 최소화, 5분 간격, 캐시 5분, stale 15분, 재시도 최대 2회, 연속 실패 시 최대 30분
- D006 Vite + TypeScript (UI 프레임워크 없음), Vitest, localStorage
- D007 UI 구조(지금 / 기록 / 상태 탭), 워드마크, IBM Plex Sans KR, 화면 용어 대응표

## 모듈 구조

CLAUDE.md의 분리 원칙(외부 통신 / 응답 검증 / 태양 방향 계산 / 저장 / 화면)을 따른다.

| 경로 | 역할 | 의존 |
|---|---|---|
| `src/types.ts` | 모듈 간 공유 타입 (계약) | 없음 |
| `src/config.ts` | D005 정책 상수 | 없음 |
| `src/api/usno.ts` | USNO celnav 요청 URL 생성, fetch, 타임아웃, HTTP·네트워크 실패 분류 | types, config |
| `src/api/validate.ts` | USNO 응답에서 태양 항목 추출, 값 범위 검증 | types |
| `src/core/direction.ts` | 회전 방향·각도 계산, 8방위 이름 | config |
| `src/core/geo.ts` | 좌표 반올림 | config |
| `src/core/time.ts` | KST 날짜 키, UTC 시각 문자열 | 없음 |
| `src/core/freshness.ts` | 캐시 유효 여부, stale 판정 | config |
| `src/data/retry.ts` | 재시도 가능 여부, 대기 시간, 재시도 실행 | types, config |
| `src/data/schedule.ts` | 자동 갱신 간격(백오프), 수동 새로고침 제한 판단 | config |
| `src/storage/store.ts` | 마지막 정상값, KST 일별 기록 (localStorage) | types |
| `src/ui/*` | `render(state)` 화면 그리기, 화면 문구 변환 | types, core |
| `src/sensors/*` | 위치(Geolocation), 방향(DeviceOrientation) | types |
| `src/app/controller.ts` | 위 모듈을 엮는 상태 관리·흐름 | 전부 |
| `src/main.ts` | 진입점 | app |

테스트는 `tests/<영역>/*.test.ts`. 테스트에서 실제 외부 API를 호출하지 않는다 (가짜 fetch 주입).
테스트용 좌표는 서울시청(37.5663, 126.9779) 같은 공개 장소만 쓴다.

## 작업 목록

| ID | 작업 | 담당 | 상태 |
|---|---|---|---|
| T1 | 프로젝트 뼈대 (package.json, tsconfig, vite 설정, index.html) | 메인 세션 | 완료 |
| T2 | 공유 타입·정책 상수 (`types.ts`, `config.ts`), `core/direction.ts` | 메인 세션 | 완료 |
| T3 | API 통신 + 응답 검증 (`src/api/*`) + 테스트 | 서브에이전트 api | 완료 (40 tests) |
| T4 | core 순수 로직 (`geo`, `time`, `freshness`) + `direction` 테스트 | 서브에이전트 core | 완료 (39 tests) |
| T5 | 재시도·갱신 간격 정책 (`src/data/*`) + 테스트 | 서브에이전트 data | 완료 (37 tests) |
| T6 | 저장소 (`src/storage/*`) + 테스트 | 서브에이전트 storage | 완료 (16 tests) |
| T7 | 화면 `render(state)`, 화면 문구, CSS (`src/ui/*`) + 테스트 | 서브에이전트 ui | 완료 (26 tests) |
| T8 | 센서 (`src/sensors/*`): 위치 권한·반올림, 방향 센서·iOS 권한 | 메인 세션 | 완료 (17 tests) |
| T9 | 컨트롤러·진입점 (`src/app/*`, `src/main.ts`): 스케줄링, 캐시, 실패 시 마지막 정상값 유지 | 메인 세션 | 완료 (12 tests) |
| T10 | 통합 확인: `npm run typecheck`, `npm test`, `npm run build`, 실제 USNO 호출 1회 확인 | 메인 세션 | 완료 |
| T11 | 문서 갱신: CLAUDE.md·AGENTS.md "현재 단계", README 실행 방법 | 메인 세션 | 완료 |
| T12 | 방향 센서 값이 바뀔 때마다 화면 전체를 다시 그리는 문제: 지금 탭일 때만 그리거나 빈도 제한 (기록 탭 select 포커스 유지) | 미배정 | 대기 |
| T13 | 실기기(휴대폰·태블릿)에서 위치·방향 센서 동작 확인 (HTTPS 필요, 배포 방식 결정과 연결) | 미배정 | 대기 |
| T14 | 과제 4 외부 실패 5종 재현 방법 정리 및 증거 수집 (`evidence/`, 테스트 좌표만 사용) | 미배정 | 대기 |

## 구현 단계에서 결정할 것 (미확정)

- 과제 4 외부 실패 5종과 `FetchFailureKind`·상태 표시의 최종 대응 (D007)
- 배포처와 Horizons 프록시 (D006)

## 작업 로그

- 2026-09-27: T1, T2 완료. T3~T7을 서브에이전트에 병렬 배정.
- 2026-09-27: T4·T5·T6 완료. `normalizeDegrees`의 -0·360 경계 버그 수정됨. T8 완료. T9 컨트롤러 작성 중.
  - 참고: `withRetry`는 탭 가림 여부를 모른다. 가려진 동안 재시도 중단은 컨트롤러 책임 (현재는 자동 호출 시작만 막음).
  - 참고: `ageMs`는 잘못된 날짜에 `Infinity`를 돌려준다. 화면에 그대로 표시하지 않는다.
- 2026-09-27: T3 완료, T9 컨트롤러 완료, T11 완료. 실제 USNO 호출을 `getSunReading`으로 1회 확인 (서울시청 좌표).
  - 참고: 이 개발 환경의 Node에서 실제 외부 호출을 하려면 `NODE_USE_ENV_PROXY=1`이 필요했다 (브라우저와 무관).
- 2026-09-27: T7·T10 완료. 전체 188 tests 통과, 타입 검사·빌드 통과. 헤드리스 Chromium에서 화면 표시 확인 (위치 없음 상태).
- 2026-09-27: 개인정보·보안 점검 후 수정.
  - Google Fonts 외부 요청 제거 → `@fontsource`로 서체를 앱에 포함 (사용자 IP가 서체 서버로 가지 않음).
  - `index.html`에 Content-Security-Policy 추가: 외부 연결은 USNO(`https://aa.usno.navy.mil`)만 허용. referrer는 보내지 않음.
  - `nextAutoRefreshAt`에서 Retry-After를 최대 30분으로 제한 (비정상적으로 큰 값으로 자동 갱신이 멈추지 않게).
  - 출처가 불분명한 테스트 좌표를 공개 장소(남산서울타워, 에펠탑) 좌표로 교체.
