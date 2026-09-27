// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '../../src/ui/render';
import { handlers, record, state } from './fixtures';

// T12: 방향 값·시계만 바뀌면 영향 없는 영역은 다시 그리지 않는다

let root: HTMLElement;
beforeEach(() => {
  document.body.replaceChildren();
  root = document.createElement('div');
  document.body.append(root);
});

const records = [record('2026-09-27', 170.9, 50.5), record('2026-09-26', 170.7, 50.8)];

describe('부분 갱신', () => {
  it('기록 탭에서 방향 값이 바뀌어도 본문과 날짜 선택 상자를 그대로 둔다', () => {
    render(root, state({ tab: 'records', records }), handlers());
    const select = root.querySelector('select') as HTMLSelectElement;
    const main = root.querySelector('main');
    select.focus();

    render(root, state({ tab: 'records', records, heading: { kind: 'available', heading: 200.4 } }), handlers());
    expect(root.querySelector('select')).toBe(select);
    expect(root.querySelector('main')).toBe(main);
    expect(document.activeElement).toBe(select);
  });

  it('기록 탭에서 시계가 지나 경과 시간이 바뀌면 헤더만 다시 그린다', () => {
    render(root, state({ tab: 'records', records }), handlers());
    const select = root.querySelector('select');
    const header = root.querySelector('header');
    expect(header?.textContent).toContain('2분 전');

    render(root, state({ tab: 'records', records, now: '2026-09-27T03:04:00.000Z' }), handlers());
    expect(root.querySelector('header')).not.toBe(header);
    expect(root.querySelector('header')?.textContent).toContain('4분 전');
    expect(root.querySelector('select')).toBe(select);
  });

  it('사용자가 고른 비교 날짜가 다시 그린 뒤에도 유지된다', () => {
    const three = [record('2026-09-27', 170.9, 50.5), record('2026-09-26', 170.7, 50.8), record('2026-09-25', 170.5, 51.2)];
    render(root, state({ tab: 'records', records: three }), handlers());
    const from = root.querySelector('select') as HTMLSelectElement;
    from.value = '2026-09-25';
    from.dispatchEvent(new Event('change'));

    render(root, state({ tab: 'records', records: three, now: '2026-09-27T03:10:00.000Z' }), handlers());
    expect((root.querySelector('select') as HTMLSelectElement).value).toBe('2026-09-25');
  });

  it('지금 탭은 방향 값이 바뀌면 다이얼 요소를 유지한 채 판만 돌린다 (부드러운 회전)', () => {
    render(root, state(), handlers());
    const dial = root.querySelector('svg.dial');
    const main = root.querySelector('main');
    const rotor = root.querySelector('.dial-rotor');
    expect(rotor?.getAttribute('style')).toContain('rotate(-138.9deg)');

    render(root, state({ heading: { kind: 'available', heading: 200 } }), handlers());
    expect(root.querySelector('svg.dial')).toBe(dial);
    expect(root.querySelector('main')).toBe(main);
    expect(root.querySelector('.dial-rotor')).toBe(rotor);
    expect(rotor?.getAttribute('style')).toContain('rotate(-200deg)');
    expect(rotor?.getAttribute('style')).toContain('transition: transform');
    // 글자는 반대로 돌려 똑바로 세운다
    expect(root.querySelector('.dial-letter')?.getAttribute('style')).toContain('rotate(200deg)');
    expect(root.textContent).toContain('왼쪽으로 29° 돌아보세요');
    expect(dial?.getAttribute('aria-label')).toContain('왼쪽으로 29°');
  });

  it('350°에서 10°로 바뀌면 판은 -340°가 아니라 20°만 돈다', () => {
    const rot = () => {
      const m = /rotate\((-?[\d.]+)deg\)/.exec(root.querySelector('.dial-rotor')?.getAttribute('style') ?? '');
      return Number(m?.[1]);
    };
    render(root, state({ heading: { kind: 'available', heading: 350 } }), handlers());
    const before = rot();
    render(root, state({ heading: { kind: 'available', heading: 10 } }), handlers());
    const after = rot();
    expect(after - before).toBeCloseTo(-20);
    // 반대 방향으로 돌아와도 누적 각도가 이어진다
    render(root, state({ heading: { kind: 'available', heading: 340 } }), handlers());
    expect(rot() - after).toBeCloseTo(30);
  });

  it('해가 정면에 와서 회전 호가 사라져도 다이얼은 유지한다', () => {
    render(root, state(), handlers());
    const dial = root.querySelector('svg.dial');
    expect(root.querySelector('.dial-arc')).not.toBeNull();
    render(root, state({ heading: { kind: 'available', heading: 170 } }), handlers());
    expect(root.querySelector('svg.dial')).toBe(dial);
    expect(root.querySelector('.dial-arc')).toBeNull();
    expect(root.querySelector('h1')?.textContent).toBe('지금 해가 정면에 있어요');
  });

  it('데이터 상태 종류가 바뀌면 본문을 교체한다', () => {
    render(root, state({ data: { kind: 'loading' } }), handlers());
    const main = root.querySelector('main');
    const dial = root.querySelector('svg.dial');
    render(root, state(), handlers());
    expect(root.querySelector('main')).not.toBe(main);
    expect(root.querySelector('svg.dial')).not.toBe(dial);
  });

  it('방향 감지 종류가 바뀌면 본문을 교체한다', () => {
    render(root, state(), handlers());
    const main = root.querySelector('main');
    render(root, state({ heading: { kind: 'needs-permission' } }), handlers());
    expect(root.querySelector('main')).not.toBe(main);
    expect(root.querySelector('svg.dial')?.getAttribute('data-mode')).toBe('north-up');
  });

  it('고쳐 쓴 지금 탭의 버튼도 가장 최근 handlers를 부른다', () => {
    const first = handlers();
    render(root, state(), first);
    const refresh = [...root.querySelectorAll('button')].find((b) => b.textContent === '새로고침') as HTMLButtonElement;
    const second = handlers();
    render(root, state({ heading: { kind: 'available', heading: 90 } }), second);
    expect([...root.querySelectorAll('button')]).toContain(refresh);
    refresh.click();
    expect(first.onRefresh).not.toHaveBeenCalled();
    expect(second.onRefresh).toHaveBeenCalledTimes(1);
  });

  it('아무것도 바뀌지 않으면 지금 탭도 그대로 둔다', () => {
    render(root, state(), handlers());
    const main = root.querySelector('main');
    render(root, state(), handlers());
    expect(root.querySelector('main')).toBe(main);
  });

  it('다시 그리지 않은 버튼도 가장 최근 handlers를 부른다', () => {
    const first = handlers();
    render(root, state(), first);
    const second = handlers();
    render(root, state(), second);
    const refresh = [...root.querySelectorAll('button')].find((b) => b.textContent === '새로고침') as HTMLButtonElement;
    refresh.click();
    expect(first.onRefresh).not.toHaveBeenCalled();
    expect(second.onRefresh).toHaveBeenCalledTimes(1);
  });

  it('루트 내용이 밖에서 지워지면 처음부터 다시 그린다', () => {
    render(root, state(), handlers());
    root.replaceChildren();
    render(root, state(), handlers());
    expect(root.querySelector('main')).not.toBeNull();
  });

  it('탭을 바꾸면 본문을 교체한다', () => {
    const onTabChange = vi.fn();
    render(root, state(), { ...handlers(), onTabChange });
    render(root, state({ tab: 'status' }), handlers());
    expect(root.querySelector('main')?.getAttribute('data-tab')).toBe('status');
  });
});
