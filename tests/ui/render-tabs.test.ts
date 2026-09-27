// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { compareRecords, render } from '../../src/ui/render';
import { buttonByText, handlers, reading, record, state } from './fixtures';

let root: HTMLElement;
beforeEach(() => {
  document.body.replaceChildren();
  root = document.createElement('div');
  document.body.append(root);
});

const text = () => root.textContent ?? '';

describe('기록 탭', () => {
  it('빈 기록', () => {
    render(root, state({ tab: 'records' }), handlers());
    expect(text()).toContain('KST 일별 기록');
    expect(text()).toContain('날짜별 첫 번째 값');
    expect(text()).toContain('아직 기록이 없어요');
    expect(text()).toContain('기록은 이 브라우저에만 저장돼요');
  });

  it('기록 목록과 기본 비교 (최신 두 개)', () => {
    const hd = handlers();
    const records = [record('2026-09-25', 170.1, 51.2), record('2026-09-27', 170.9, 50.5), record('2026-09-26', 170.7, 50.9)];
    render(root, state({ tab: 'records', records }), hd);
    const rows = [...root.querySelectorAll('tbody tr')];
    expect(rows).toHaveLength(3);
    expect(rows[0].textContent).toContain('2026-09-27 (일)');
    expect(rows[0].textContent).toContain('12:00 KST 조회');
    expect(rows[0].textContent).toContain('USNO');

    const from = root.querySelector('#compare-from') as HTMLSelectElement;
    const to = root.querySelector('#compare-to') as HTMLSelectElement;
    expect(root.querySelector('label[for="compare-from"]')).not.toBeNull();
    expect(from.value).toBe('2026-09-26');
    expect(to.value).toBe('2026-09-27');
    const result = () => root.querySelector('.compare-result')!.textContent ?? '';
    expect(result()).toContain('+0.2°');
    expect(result()).toContain('−0.4°');
    expect(result()).toContain('170.7° → 170.9°');

    from.value = '2026-09-25';
    from.dispatchEvent(new Event('change'));
    expect(result()).toContain('+0.8°');
    expect(result()).toContain('−0.7°');

    // 다시 그려도 선택이 유지된다
    render(root, state({ tab: 'records', records }), hd);
    expect((root.querySelector('#compare-from') as HTMLSelectElement).value).toBe('2026-09-25');

    buttonByText(root, '기록 내보내기 (JSON)')!.click();
    expect(hd.onExportRecords).toHaveBeenCalledOnce();
  });

  it('방위각 차이는 북쪽을 넘을 때 짧은 쪽으로 계산한다', () => {
    const d = compareRecords(record('2026-09-26', 359, 10), record('2026-09-27', 1, 10));
    expect(d.azimuth).toBeCloseTo(2);
  });
});

describe('상태 탭', () => {
  it('현재 상태, 기기, 요청 기록 알약', () => {
    render(
      root,
      state({
        tab: 'status',
        requestLog: [
          { at: '2026-09-27T02:50:00.000Z', trigger: 'initial', outcome: 'success', attempts: 1 },
          { at: '2026-09-27T02:55:00.000Z', trigger: 'auto', outcome: 'failure', attempts: 3, failure: { kind: 'timeout', message: '' } },
          { at: '2026-09-27T03:00:00.000Z', trigger: 'manual', outcome: 'cache-hit', attempts: 0 },
        ],
      }),
      handlers(),
    );
    expect(text()).toContain('실시간으로 받아오고 있어요');
    expect(text()).toContain('USNO celnav');
    expect(text()).toContain('13분 남음');
    expect(text()).toContain('방향 감지 중 (138.9°)');
    const items = [...root.querySelectorAll('.log-item')];
    expect(items).toHaveLength(3);
    expect(items[0].querySelector('.pill')!.textContent).toBe('최근 값');
    expect(items[1].querySelector('.pill-error')!.textContent).toBe('실패');
    expect(items[1].textContent).toContain('응답이 늦어지고 있어요');
    expect(items[2].querySelector('.pill-fresh')!.textContent).toBe('성공');
    expect(root.querySelector('.card-policy.hide-mobile')).not.toBeNull();
    const cross = buttonByText(root, 'JPL Horizons로 교차 검증 · 배포 방식 결정 후')!;
    expect(cross.disabled).toBe(true);
  });

  it('실패 상태와 방향 감지 안 됨', () => {
    render(
      root,
      state({
        tab: 'status',
        heading: { kind: 'unavailable', reason: 'unsupported' },
        data: { kind: 'failed', failure: { kind: 'network', message: '' }, lastGood: reading(), nextAttemptAt: null },
      }),
      handlers(),
    );
    expect(text()).toContain('불러오지 못했어요');
    expect(text()).toContain('방향 감지 안 됨');
    expect(text()).not.toContain('남음');
    expect(root.querySelector('.card-lastgood')!.textContent).toContain('170.9°');
  });
});
