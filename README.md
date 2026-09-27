# Sunflower

현재 위치를 기준으로 사용자가 해를 바라보려면 어느 방향을 봐야 하는지 알려주는 웹 애플리케이션.

## 아이디어

1. 사용자의 현재 위치를 얻는다.
2. 공개 API를 이용해 현재 태양의 위치를 얻는다.
3. 태양의 방위각과 사용자가 바라보는 방향을 비교한다.
4. 왼쪽 또는 오른쪽으로 얼마나 돌아야 하는지 알려준다.

## 과제 목표

이 프로젝트는 과제 4와 이후 과제 5에 사용할 예정이다.

과제 4에서는 외부 API가 실패하거나 이상한 데이터를 반환했을 때도
마지막 정상값과 현재 데이터 상태를 명확하게 보여주는 것을 목표로 한다.

과제 5에서는 이 프로젝트의 작은 개선 하나를 두 개의 서로 다른 AI 세션이
인수인계 문서를 통해 이어서 완성하는 실험에 사용한다.

## 현재 상태

기능 구현 진행 중. 진행 상황과 남은 작업은 `docs/IMPLEMENTATION.md`를 참고한다.

## 실행 방법

Node.js 20 이상이 필요하다.

```bash
npm install
npm run dev        # 개발 서버 (http://localhost:5173)
npm test           # 테스트 (외부 API를 호출하지 않는다)
npm run typecheck  # 타입 검사
npm run build      # 배포용 빌드 (dist/)
```

위치와 방향 센서는 보안 연결(HTTPS 또는 localhost)에서만 동작한다.
휴대폰에서 방향 안내를 확인하려면 HTTPS로 접속해야 한다.

## 사용 API

- 주 API: [USNO Astronomical Applications API — celnav](https://aa.usno.navy.mil/data/api) (태양 방위각·고도, API key 불필요)
- 교차 검증용: [NASA JPL Horizons API](https://ssd-api.jpl.nasa.gov/doc/horizons.html) (필요할 때만 사용)

결정 배경은 `docs/DECISIONS.md`의 D003, D004를 참고한다.

## 기술 스택

- 화면: Vite + TypeScript (UI 프레임워크 없음)
- 테스트: Vitest
- 저장소: localStorage

결정 배경은 `docs/DECISIONS.md`의 D006을 참고한다.
