// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { buildDial } from '../../src/ui/dial';
import { render } from '../../src/ui/render';
import { buttonByText, handlers, reading, state } from './fixtures';

let root: HTMLElement;
beforeEach(() => {
  document.body.replaceChildren();
  root = document.createElement('div');
  document.body.append(root);
});

const text = () => root.textContent ?? '';

describe('지금 탭', () => {
  it('fresh + 방향 감지: heading-up 다이얼과 회전 안내, 경과 시간 포함 알약', () => {
    render(root, state(), handlers());
    expect(root.querySelector('h1')?.textContent).toBe('오른쪽으로 32° 돌아보세요');
    expect(text()).toContain('해는 남쪽, 지평선 위 50.5°에 있어요');
    expect(text()).toContain('실시간 · 2분 전');
    expect(text()).not.toContain('방향 감지 안 됨');
    const dial = root.querySelector('svg.dial') as SVGSVGElement;
    expect(dial.dataset.mode).toBe('heading-up');
    expect(dial.getAttribute('aria-label')).toContain('오른쪽으로 32°');
    expect(root.querySelector('.dial-notch')).not.toBeNull();
    expect(root.querySelector('.dial-arc')).not.toBeNull();
    expect(text()).toContain('170.9°');
    expect(text()).toContain('50.5°');
    expect(text()).toContain('USNO · 12:00 KST 조회 · 다음 자동 갱신 3분 후');
  });

  it('해가 정면이면 정면 안내', () => {
    render(root, state({ heading: { kind: 'available', heading: 168 } }), handlers());
    expect(root.querySelector('h1')?.textContent).toBe('지금 해가 정면에 있어요');
    expect(root.querySelector('.dial-arc')).toBeNull();
  });

  it('왼쪽 회전', () => {
    render(root, state({ heading: { kind: 'available', heading: 185.9 } }), handlers());
    expect(root.querySelector('h1')?.textContent).toBe('왼쪽으로 15° 돌아보세요');
  });

  it('해가 지평선 아래면 고도 안내', () => {
    render(root, state({ data: { kind: 'fresh', reading: reading({}, { azimuth: 290, altitude: -12.3 }) } }), handlers());
    expect(text()).toContain('해가 지평선 아래에 있어요 (고도 -12.3°)');
  });

  it('cached, stale 알약', () => {
    render(root, state({ data: { kind: 'cached', reading: reading() } }), handlers());
    expect(text()).toContain('최근 값 · 2분 전');
    render(
      root,
      state({ data: { kind: 'stale', reading: reading({ fetchedAt: '2026-09-27T02:40:00.000Z' }) } }),
      handlers(),
    );
    expect(text()).toContain('오래된 값 · 22분 전');
    expect(root.querySelector('.values.is-dim')).not.toBeNull();
  });

  it('loading', () => {
    render(root, state({ data: { kind: 'loading' } }), handlers());
    expect(text()).toContain('해의 위치를 받아오고 있어요');
    expect(text()).not.toContain('170.9°');
  });

  it('방향 권한 필요: north-up, 방위 안내, 허용 버튼', () => {
    const hd = handlers();
    render(root, state({ heading: { kind: 'needs-permission' } }), hd);
    expect(root.querySelector('h1')?.textContent).toBe('남쪽(170.9°)을 바라보세요');
    expect(text()).toContain('방향 감지 안 됨');
    const dial = root.querySelector('svg.dial') as SVGSVGElement;
    expect(dial.dataset.mode).toBe('north-up');
    expect(root.querySelector('.dial-notch')).toBeNull();
    buttonByText(root, '방향 감지 허용하기')!.click();
    expect(hd.onRequestHeading).toHaveBeenCalledOnce();
  });

  it('방향 센서 없음: 방위 안내, 허용 버튼 없음', () => {
    render(root, state({ heading: { kind: 'unavailable', reason: 'unsupported' } }), handlers());
    expect(root.querySelector('h1')?.textContent).toBe('남쪽(170.9°)을 바라보세요');
    expect(text()).toContain('이 기기는 향한 방향을 알 수 없어서 방위로 알려드려요');
    expect(text()).toContain('방향 감지 안 됨');
    expect(buttonByText(root, '방향 감지 허용하기')).toBeUndefined();
  });

  it('no-location: 값 없이 위치 허용 안내', () => {
    const hd = handlers();
    render(root, state({ data: { kind: 'no-location', reason: 'denied' } }), hd);
    expect(text()).toContain('방향 감지 안 됨');
    expect(root.querySelector('h1')?.textContent).toBe('지금 위치를 확인할 수 없어요');
    expect(text()).toContain('해의 방향을 찾으려면 위치가 필요해요');
    expect(text()).not.toContain('°');
    expect(root.querySelector('.dial-sun')).toBeNull();
    buttonByText(root, '위치 허용하기')!.click();
    expect(hd.onRequestLocation).toHaveBeenCalledOnce();
  });

  it('failed + 마지막 정상값: 현재 값처럼 보이지 않게 라벨을 붙인다', () => {
    render(
      root,
      state({
        data: {
          kind: 'failed',
          failure: { kind: 'timeout', message: 'x' },
          lastGood: reading({ fetchedAt: '2026-09-27T02:12:00.000Z' }),
          nextAttemptAt: '2026-09-27T03:12:00.000Z',
        },
      }),
      handlers(),
    );
    expect(text()).toContain('응답이 늦어지고 있어요');
    expect(text()).toContain('잠시 후 다시 시도해 주세요');
    expect(text()).toContain('다음 시도 12:12 KST');
    expect(text()).toContain('마지막으로 받은 값 (11:12 KST)');
    expect(text()).not.toContain('실시간');
    expect(text()).not.toContain('다음 자동 갱신');
    expect(root.querySelector('.values.is-dim')).not.toBeNull();
    expect(root.querySelector('.now-visual.is-dim')).not.toBeNull();
  });

  it('failed + 마지막 정상값 없음: 값을 표시하지 않는다', () => {
    const hd = handlers();
    render(
      root,
      state({
        data: { kind: 'failed', failure: { kind: 'http', status: 429, message: 'x' }, lastGood: null, nextAttemptAt: null },
      }),
      hd,
    );
    expect(text()).toContain('요청이 너무 많아요. 잠시 기다려 주세요');
    expect(text()).not.toContain('°');
    expect(text()).not.toContain('마지막으로 받은 값');
    expect(root.querySelector('.dial-sun')).toBeNull();
    buttonByText(root, '새로고침')!.click();
    expect(hd.onRefresh).toHaveBeenCalledOnce();
  });

  it('새로고침 버튼', () => {
    const hd = handlers();
    render(root, state(), hd);
    buttonByText(root, '새로고침')!.click();
    expect(hd.onRefresh).toHaveBeenCalledOnce();
  });
});

describe('공통', () => {
  it('워드마크, 활성 탭 aria-current, 탭 클릭', () => {
    const hd = handlers();
    render(root, state(), hd);
    const wm = root.querySelector('.wordmark')!;
    expect(wm.textContent).toBe('sunflower');
    expect(wm.querySelector('.o')?.textContent).toBe('o');
    const tabs = [...root.querySelectorAll('nav button')] as HTMLButtonElement[];
    expect(tabs.map((b) => b.textContent)).toEqual(['지금', '기록', '상태']);
    expect(tabs[0].getAttribute('aria-current')).toBe('page');
    expect(tabs[1].hasAttribute('aria-current')).toBe(false);
    tabs[2].click();
    expect(hd.onTabChange).toHaveBeenCalledWith('status');
  });

  it('id 접두어를 주지 않은 다이얼은 인스턴스마다 그라디언트 id가 다르다', () => {
    const a = buildDial({ mode: 'north-up', sunAzimuth: 170.9, label: 'a' });
    const b = buildDial({ mode: 'north-up', sunAzimuth: 170.9, label: 'b' });
    expect(a.querySelector('radialGradient')!.id).not.toBe(b.querySelector('radialGradient')!.id);
  });

  it('다이얼 판은 -heading만큼 돌고, rotation을 주면 그 값을 쓴다', () => {
    const style = (svg: SVGSVGElement) => svg.querySelector('.dial-rotor')!.getAttribute('style') ?? '';
    const a = buildDial({ mode: 'heading-up', heading: 90, sunAzimuth: 170.9, label: 'a' });
    expect(style(a)).toContain('rotate(-90deg)');
    expect(style(a)).toContain('transform-origin: 150px 150px');
    const b = buildDial({ mode: 'heading-up', heading: 90, rotation: 270, sunAzimuth: 170.9, label: 'b' });
    expect(style(b)).toContain('rotate(270deg)');
    const c = buildDial({ mode: 'north-up', sunAzimuth: 170.9, label: 'c' });
    expect(style(c)).toContain('rotate(0deg)');
  });

  it('animate: false면 회전 애니메이션을 넣지 않는다 (동작 줄이기)', () => {
    const d = buildDial({ mode: 'heading-up', heading: 90, sunAzimuth: 170.9, label: 'd', animate: false });
    for (const node of d.querySelectorAll('[style]')) expect(node.getAttribute('style')).not.toContain('transition');
  });

  it('동작 줄이기 설정을 켜면 기본으로 애니메이션을 넣지 않는다', () => {
    const original = window.matchMedia;
    window.matchMedia = ((q: string) => ({ matches: q.includes('reduce') })) as unknown as typeof window.matchMedia;
    try {
      const d = buildDial({ mode: 'heading-up', heading: 90, sunAzimuth: 170.9, label: 'd' });
      expect(d.querySelector('.dial-rotor')!.getAttribute('style')).not.toContain('transition');
    } finally {
      window.matchMedia = original;
    }
  });

  it('화면의 다이얼은 고정 id를 써서 같은 상태면 같은 결과를 그린다 (T12)', () => {
    render(root, state(), handlers());
    expect(root.querySelector('radialGradient')!.id).toBe('sun-dial-glow');
  });
});

describe('위치 확인 단계 표시 (T22 C)', () => {
  it('위치를 확인하는 동안과 해의 위치를 받는 동안 문구가 다르다', () => {
    render(root, state({ data: { kind: 'loading' }, location: 'locating' }), handlers());
    expect(root.textContent).toContain('위치를 확인하고 있어요');
    render(root, state({ data: { kind: 'loading' }, location: 'current' }), handlers());
    expect(root.textContent).toContain('해의 위치를 받아오고 있어요');
  });

  it('이전 위치 기준으로 보여줄 때 안내한다', () => {
    render(root, state({ location: 'provisional' }), handlers());
    expect(root.textContent).toContain('이전 위치 기준 · 현재 위치 확인 중');
    render(root, state({ location: 'last-known' }), handlers());
    expect(root.textContent).toContain('현재 위치를 확인하지 못해 이전 위치 기준으로 보여드려요');
    render(root, state({ location: 'current' }), handlers());
    expect(root.textContent).not.toContain('이전 위치 기준');
  });
});
