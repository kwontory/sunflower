# Assignment 4 Plan

## 과제에서 보여줘야 하는 것

### 1. 실제 공개 데이터

Sunflower에서 실제 공개 API를 사용한다.

사용 API는 D003에서 확정했다.

#### 주 API

- API 이름: USNO Astronomical Applications API — Celestial Navigation (celnav)
- 공식 문서: https://aa.usno.navy.mil/data/api
- endpoint: `https://aa.usno.navy.mil/api/celnav?date=YYYY-MM-DD&time=hh:mm:ss&coords=위도,경도`
- 사용 데이터: 응답 중 `object`가 `"Sun"`인 항목의 `almanac_data.zn`(방위각), `almanac_data.hc`(고도)
- 인증 필요 여부: 필요 없음 (선택 파라미터 `ID`는 사용자 수 집계용)
- 참고: `time`은 UT1 기준이며, CORS를 허용한다.

#### 교차 검증용 API (필요할 때만)

- API 이름: NASA JPL Horizons API
- 공식 문서: https://ssd-api.jpl.nasa.gov/doc/horizons.html
- endpoint: `https://ssd.jpl.nasa.gov/api/horizons.api`
- 사용 데이터: 관측자 기준 태양의 방위각(`Azi`)과 고도(`Elev`)
- 인증 필요 여부: 필요 없음
- 참고: CORS 헤더가 없어 브라우저에서 직접 호출할 수 없고, 응답이 텍스트 표 형식이다.

#### 호출 원칙

두 API 모두 공식 호출 한도가 명시되어 있지 않으므로
외부 API 호출 횟수를 최대한 줄이는 방향으로 구현한다. (D004)

구체적인 호출 간격, 캐시, 재시도 정책은 D005를 따른다.

- 자동 갱신: 탭이 보이는 동안 5분 간격
- 요청 캐시 5분, 마지막 정상값은 조회 후 15분이 지나면 stale 표시
- 재시도: 일시적 오류만 최대 2회, 연속 실패 시 갱신 간격을 최대 30분까지 늘림

---

### 2. 외부 실패 5종

최종 실패 종류는 구현하면서 확정한다.

현재 후보:

1. Timeout
2. Network failure
3. HTTP error
4. Invalid response
5. Invalid or stale data

---

### 3. 마지막 정상값

새 API 요청이 실패해도 기존 정상 데이터를 삭제하지 않는 구조를 만든다.

현재값과 마지막 정상값은 UI에서 구분한다.

---

### 4. KST 일별 기록

정상 데이터를 KST 날짜 기준으로 저장할 수 있게 한다.

최종 제출 전 실제로 서로 다른 KST 날짜의 기록 2건을 확보한다.

---

### 5. 개인정보 / 비밀값

공개 제출물에는 실제 개인 위치를 남기지 않는다.

검증에는 공개된 테스트 위치 또는 개인정보가 아닌 좌표를 사용한다.

가능하면 API key가 필요 없는 공개 API를 우선 검토한다.

