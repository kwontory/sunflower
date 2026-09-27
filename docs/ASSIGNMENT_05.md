# Assignment 5

## 상태

과제 5 실험 준비 단계.

AI A 작업은 아직 시작하지 않았다.

## 작은 개선

태양의 고도가 0° 이하일 때
해가 지평선 아래에 있어 직접 볼 수 없음을 표시한다.

이 상태에서는 일반적인 좌/우 회전 또는 방위 안내를 표시하지 않는다.

## 고정 검사

고정 검사 문서:

`docs/ASSIGNMENT_05_FIXED_CHECKS.md`

실제 자동 검사:

`tests/assignment5/fixed-checks.test.ts`

검사는 정확히 10개다.

AI A 시작 이후 다음 변경을 금지한다.

- 검사 삭제
- 입력 완화
- 기대값 변경

## 공통 사용 상한

`docs/ASSIGNMENT_05_LIMITS.md`

- 시간 상한: 30분
- 요청 상한: 10회

AI A와 AI B에 동일하게 적용한다.

## 공통 최소 요청

`docs/ASSIGNMENT_05_PROMPT.md`

AI A와 AI B 모두 같은 기본 요청을 받는다.

## AI 역할

AI A:
Codex

AI B:
Claude Code

두 AI는 서로 다른 서비스 또는 모델을 사용한다.

## 진행 순서

1. 과제 5 시작 커밋 고정
2. AI A 시작
3. AI A 종료 및 HANDOFF 작성
4. 새 작업 폴더 생성
5. AI B 새 대화 시작
6. 저장소 + HANDOFF만 제공
7. AI B가 동일 검사 10개 실행
8. AI B가 기능 완성
9. 결과 비교

