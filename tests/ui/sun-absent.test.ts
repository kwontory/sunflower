// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { render } from '../../src/ui/render';
import type { DataStatus } from '../../src/types';
import { NOW, handlers, reading, state } from './fixtures';

let root: HTMLElement;
beforeEach(() => {
  document.body.replaceChildren();
  root = document.createElement('div');
  document.body.append(root);
});

const text = () => root.textContent ?? '';
const DIRECTION_GUIDE = /(?:왼쪽|오른쪽)으로 \d+° 돌아보세요|바라보세요/;

// 낮에 받은 마지막 정상값 (고도가 지평선 위)
const daytimeLastGood = reading({ fetchedAt: '2026-09-27T02:12:00.000Z' }, { azimuth: 170.9, altitude: 50.5 });
const sunAbsent = (lastGood = daytimeLastGood): DataStatus => ({ kind: 'sun-absent', checkedAt: NOW, lastGood });

describe('해 없음 상태 (T30)', () => {
  it('지금 탭: 달 그림과 지평선 아래 안내를 보여주고 실패처럼 보이지 않는다', () => {
    render(root, state({ data: sunAbsent() }), handlers());

    expect(root.querySelector('.dial-night')).not.toBeNull();
    expect(root.querySelector('.dial-letter')).toBeNull();
    expect(root.querySelector('h1')?.textContent).toBe('지금은 해가 지평선 아래에 있어요');
    expect(root.querySelector('.pill-night')?.textContent).toBe('지평선 아래 · 방금 확인');
    // 데이터 출처의 내부 동작 설명은 사용자에게 보이지 않는다
    expect(text()).not.toContain('알려주지 않아요');
    expect(text()).not.toContain('불러오지 못했어요');
    expect(root.querySelector('[role="alert"]')).toBeNull();
    expect(text()).toContain('USNO · 12:02 KST 조회');
  });

  it('낮에 받은 마지막 정상값이 있어도 방향 안내를 만들지 않고 과거 값으로만 보여준다', () => {
    render(root, state({ data: sunAbsent(), heading: { kind: 'available', heading: 138.9 } }), handlers());

    expect(text()).not.toMatch(DIRECTION_GUIDE);
    expect(root.querySelector('.dial-arc')).toBeNull();
    expect(text()).toContain('마지막으로 받은 값 (11:12 KST)');
    expect(root.querySelector('.values.is-dim')).not.toBeNull();
    expect(text()).not.toContain('실시간');
  });

  it('방향 센서 권한이 없어도 방위 안내와 권한 버튼을 보이지 않는다', () => {
    render(root, state({ data: sunAbsent(), heading: { kind: 'needs-permission' } }), handlers());
    expect(text()).not.toMatch(DIRECTION_GUIDE);
    expect(text()).not.toContain('방향 감지 허용하기');
  });

  it('마지막 정상값이 없으면 값 카드를 그리지 않는다', () => {
    render(root, state({ data: { kind: 'sun-absent', checkedAt: NOW, lastGood: null } }), handlers());
    expect(root.querySelector('.values')).toBeNull();
    expect(root.querySelector('h1')?.textContent).toBe('지금은 해가 지평선 아래에 있어요');
  });

  it('상태 탭: 조회 시각은 이번 확인 시각이고, 마지막 정상값은 따로 보여준다', () => {
    render(root, state({ tab: 'status', data: sunAbsent() }), handlers());
    const status = root.querySelector('.card-status')!.textContent;
    expect(status).toContain('해가 지평선 아래에 있어요');
    expect(status).toContain('12:02 KST');
    expect(root.querySelector('.card-lastgood')!.textContent).toContain('11:12 KST');
  });

  it('요청 기록에 지평선 아래로 표시한다', () => {
    render(
      root,
      state({ tab: 'status', data: sunAbsent(), requestLog: [{ at: NOW, trigger: 'auto', outcome: 'sun-absent', attempts: 1 }] }),
      handlers(),
    );
    expect(root.querySelector('.log-item .pill-night')?.textContent).toBe('지평선 아래');
  });
});

describe('실패 중 마지막 정상값으로는 방향 안내를 하지 않는다', () => {
  const failed: DataStatus = {
    kind: 'failed',
    failure: { kind: 'network', message: 'x' },
    lastGood: daytimeLastGood,
    nextAttemptAt: null,
  };

  it('방향 센서가 있어도 회전 안내·호 없이 북쪽 위 다이얼로 보여준다', () => {
    render(root, state({ data: failed, heading: { kind: 'available', heading: 138.9 } }), handlers());
    expect(text()).not.toMatch(DIRECTION_GUIDE);
    expect(root.querySelector('.dial-arc')).toBeNull();
    expect(root.querySelector('.dial')?.getAttribute('data-mode')).toBe('north-up');
    expect(root.querySelector('h1')?.textContent).toBe('마지막으로 받은 값으로는 방향을 안내하지 않아요');
    expect(text()).toContain('그때 해는 남쪽, 지평선 위 50.5°에 있었어요');
  });

  it('마지막 정상값 캡션은 한 번만 보인다', () => {
    render(root, state({ data: failed }), handlers());
    expect(text().split('마지막으로 받은 값 (11:12 KST)')).toHaveLength(2);
  });

  it('방향 센서가 없어도 방위 안내와 권한 버튼을 보이지 않는다', () => {
    render(root, state({ data: failed, heading: { kind: 'needs-permission' } }), handlers());
    expect(text()).not.toMatch(DIRECTION_GUIDE);
    expect(text()).not.toContain('방향 감지 허용하기');
  });
});

describe('지평선 이하 값은 나침반 대신 달을 보여준다', () => {
  it('현재 값의 고도가 0° 이하이면 달 그림', () => {
    render(root, state({ data: { kind: 'fresh', reading: reading({}, { azimuth: 270, altitude: -18 }) } }), handlers());
    expect(root.querySelector('.dial-night')).not.toBeNull();
    expect(root.querySelector('.dial-letter')).toBeNull();
  });

  it('고도가 0°보다 높으면 나침반', () => {
    render(root, state({ data: { kind: 'fresh', reading: reading({}, { azimuth: 270, altitude: 0.1 }) } }), handlers());
    expect(root.querySelector('.dial-night')).toBeNull();
    expect(root.querySelector('.dial-letter')).not.toBeNull();
  });
});
