// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { render } from '../../src/ui/render';
import { handlers, reading, state } from './fixtures';

let root: HTMLElement;
beforeEach(() => {
  document.body.replaceChildren();
  root = document.createElement('div');
  document.body.append(root);
});

describe('지평선 이하 안내', () => {
  it.each([0, -0.1, -18])('고도 %s°에서 센서 회전 안내와 다이얼 호를 숨긴다', (altitude) => {
    render(root, state({ data: { kind: 'fresh', reading: reading({}, { azimuth: 270, altitude }) } }), handlers());

    expect(root.querySelector('h1')?.textContent).toBe('지금은 해를 직접 볼 수 없어요');
    expect(root.textContent).toContain('해가 지평선 아래에 있어요');
    expect(root.textContent).toContain('270.0°');
    expect(root.textContent).toContain('USNO');
    expect(root.textContent).toContain('실시간');
    expect(root.textContent).not.toMatch(/(?:왼쪽|오른쪽)으로 \d+° 돌아보세요/);
    expect(root.querySelector('.dial-arc')).toBeNull();
    expect(root.querySelector('.dial')?.getAttribute('aria-label')).not.toContain('돌아보세요');
  });

  it('센서가 없어도 방위 안내와 방향 권한 안내를 숨긴다', () => {
    render(root, state({
      data: { kind: 'fresh', reading: reading({}, { azimuth: 270, altitude: -18 }) },
      heading: { kind: 'needs-permission' },
    }), handlers());

    expect(root.textContent).not.toContain('바라보세요');
    expect(root.textContent).not.toContain('돌아야 할 방향');
    expect(root.textContent).not.toContain('방향 감지 허용하기');
  });

  it('실패 시 마지막 정상값의 야간 의미와 실패 상태를 분리한다', () => {
    render(root, state({ data: {
      kind: 'failed',
      failure: { kind: 'timeout', message: 'test' },
      lastGood: reading({}, { azimuth: 270, altitude: -18 }),
      nextAttemptAt: null,
    } }), handlers());

    expect(root.textContent).toContain('응답이 늦어지고 있어요');
    expect(root.textContent).toContain('마지막으로 받은 값');
    expect(root.querySelector('h1')?.textContent).toBe('이 값에서 해를 직접 볼 수 없어요');
    expect(root.textContent).not.toContain('실시간');
    expect(root.textContent).not.toContain('바라보세요');
  });

  it('상태 탭에서도 마지막 정상값의 고도가 지평선 이하임을 표시한다', () => {
    render(root, state({
      tab: 'status',
      data: {
        kind: 'failed',
        failure: { kind: 'network', message: 'test' },
        lastGood: reading({}, { azimuth: 270, altitude: -18 }),
        nextAttemptAt: null,
      },
    }), handlers());

    expect(root.querySelector('.card-status')?.textContent).toContain('불러오지 못했어요');
    expect(root.querySelector('.card-lastgood')?.textContent).toContain('-18.0° · 지평선 이하');
  });
});
