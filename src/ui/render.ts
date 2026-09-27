// AppState를 받아 화면 전체를 다시 그린다. 상태는 바꾸지 않고 사용자 동작은 handlers로 넘긴다.
import type { AppState, DailyRecord, DataStatus, HeadingStatus, RequestLogEntry, SunReading, Tab } from '../types';
import { STALE_AFTER_MS } from '../config';
import { compassPoint, computeTurn, normalizeDegrees } from '../core/direction';
import { buildDial, unwrapRotation } from './dial';
import {
  formatDegrees,
  formatElapsed,
  formatKstDateLabel,
  formatKstTime,
  formatSignedDegrees,
  minutesUntil,
} from './format';
import {
  T,
  TAB_LABELS,
  attemptsText,
  cachedPill,
  facingHeadline,
  failureMessage,
  freshPill,
  headingActive,
  lastGoodLabel,
  minutesLater,
  minutesLeft,
  nextAttemptText,
  outcomeLabel,
  sourceLine,
  stalePill,
  statusHeadline,
  sunSub,
  triggerLabel,
  turnHeadline,
} from './text';

export interface UiHandlers {
  onTabChange(tab: Tab): void;
  onRefresh(): void;
  onRequestHeading(): void;
  onRequestLocation(): void;
  onExportRecords(): void;
}

type Tone = 'fresh' | 'cached' | 'stale' | 'error' | 'neutral';

const TABS: Tab[] = ['now', 'records', 'status'];

// 기록 비교에서 고른 날짜. AppState가 아니라 화면 내부 상태로 둔다.
const compareSelection = new WeakMap<HTMLElement, { from: string; to: string }>();

// ---------- DOM 도우미 ----------

type Child = Node | string | null | undefined | false;

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: { class?: string; text?: string; attrs?: Record<string, string> } = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.class) node.className = props.class;
  if (props.text !== undefined) node.textContent = props.text;
  if (props.attrs) for (const [k, v] of Object.entries(props.attrs)) node.setAttribute(k, v);
  for (const c of children) if (c) node.append(c);
  return node;
}

function pill(tone: Tone, text: string): HTMLSpanElement {
  return h('span', { class: `pill pill-${tone}`, text });
}

function button(text: string, onClick: () => void, cls = 'btn'): HTMLButtonElement {
  const b = h('button', { class: cls, text, attrs: { type: 'button' } });
  b.addEventListener('click', onClick);
  return b;
}

function card(cls: string, ...children: Child[]): HTMLElement {
  return h('section', { class: `card ${cls}` }, ...children);
}

function row(label: string, value: string): HTMLElement {
  return h('div', { class: 'kv' }, h('dt', { text: label }), h('dd', { class: 'num', text: value }));
}

// ---------- 상태 해석 ----------

/** 화면에 값을 보여줄 수 있는 reading과 그것이 "현재 값"인지 */
function readingOf(data: DataStatus): { reading: SunReading; current: boolean } | null {
  switch (data.kind) {
    case 'fresh':
    case 'cached':
    case 'stale':
      return { reading: data.reading, current: true };
    case 'failed':
      return data.lastGood ? { reading: data.lastGood, current: false } : null;
    default:
      return null;
  }
}

export function dataPill(state: AppState): { tone: Tone; text: string } {
  const d = state.data;
  switch (d.kind) {
    case 'fresh':
      return { tone: 'fresh', text: freshPill(formatElapsed(d.reading.fetchedAt, state.now)) };
    case 'cached':
      return { tone: 'cached', text: cachedPill(formatElapsed(d.reading.fetchedAt, state.now)) };
    case 'stale':
      return { tone: 'stale', text: stalePill(formatElapsed(d.reading.fetchedAt, state.now)) };
    case 'failed':
      return { tone: 'error', text: failureMessage(d.failure) };
    case 'no-location':
      return { tone: 'neutral', text: T.headingOff };
    case 'loading':
      return { tone: 'neutral', text: T.checking };
  }
}

// ---------- 공통 영역 ----------

function tabIcon(tab: Tab): SVGSVGElement {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'tab-icon');
  const paths: Record<Tab, string[]> = {
    now: ['M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18Z', 'M12 7l2.5 5L12 17l-2.5-5Z'],
    records: ['M5 6h14', 'M5 12h14', 'M5 18h9'],
    status: ['M3 12h4l2-5l4 10l2-5h6'],
  };
  for (const d of paths[tab]) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    svg.append(p);
  }
  return svg;
}

function renderHeader(state: AppState, handlers: UiHandlers): HTMLElement {
  const wordmark = h('div', { class: 'wordmark', attrs: { 'aria-label': 'sunflower' } });
  wordmark.append('sunfl', h('span', { class: 'o', text: 'o' }), 'wer');

  const nav = h('nav', { class: 'tabs', attrs: { 'aria-label': '화면 선택' } });
  for (const tab of TABS) {
    const b = h('button', { class: 'tab', attrs: { type: 'button', 'data-tab': tab } });
    b.append(tabIcon(tab), h('span', { class: 'tab-label', text: TAB_LABELS[tab] }));
    if (tab === state.tab) b.setAttribute('aria-current', 'page');
    b.addEventListener('click', () => handlers.onTabChange(tab));
    nav.append(b);
  }

  const p = dataPill(state);
  const status = h('div', { class: 'header-status' }, pill(p.tone, p.text));
  status.setAttribute('aria-live', 'polite');
  return h('header', { class: 'app-header' }, h('div', { class: 'header-inner' }, wordmark, nav, status));
}

// ---------- 지금 탭 ----------

function valueCards(reading: SunReading, dim: boolean, caption: string | null): HTMLElement {
  const { azimuth, altitude } = reading.position;
  const wrap = h('div', { class: dim ? 'values is-dim' : 'values' });
  if (caption) wrap.append(h('p', { class: 'values-caption', text: caption }));
  const grid = h(
    'div',
    { class: 'value-grid' },
    h(
      'div',
      { class: 'value-card' },
      h('div', { class: 'value-label', text: T.azimuth }),
      h('div', { class: 'value-num num', text: formatDegrees(azimuth) }),
      h('div', { class: 'value-sub', text: `${compassPoint(azimuth)}쪽` }),
    ),
    h(
      'div',
      { class: 'value-card' },
      h('div', { class: 'value-label', text: T.altitude }),
      h('div', { class: 'value-num num', text: formatDegrees(altitude) }),
      h('div', { class: 'value-sub', text: altitude < 0 ? '지평선 아래' : '지평선 위' }),
    ),
  );
  wrap.append(grid);
  return wrap;
}

function sourceRow(state: AppState, reading: SunReading | null, handlers: UiHandlers): HTMLElement {
  const r = h('div', { class: 'source-row' });
  if (reading) {
    const next = state.nextRefreshAt && state.data.kind !== 'failed' ? minutesUntil(state.nextRefreshAt, state.now) : null;
    r.append(h('span', { class: 'source-text num', text: sourceLine(formatKstTime(reading.fetchedAt), next) }));
  }
  r.append(button(T.refresh, handlers.onRefresh, 'btn btn-secondary'));
  return r;
}

function failureBlock(data: Extract<DataStatus, { kind: 'failed' }>): HTMLElement {
  const block = h(
    'div',
    { class: 'failure', attrs: { role: 'alert' } },
    h('p', { class: 'failure-title', text: failureMessage(data.failure) }),
    h('p', { class: 'failure-body', text: T.retryLater }),
  );
  if (data.nextAttemptAt) block.append(h('p', { class: 'failure-next num', text: nextAttemptText(formatKstTime(data.nextAttemptAt)) }));
  return block;
}

function dialLabel(heading: HeadingStatus, azimuth: number | null): string {
  if (azimuth === null) return '나침반';
  if (heading.kind === 'available') {
    const turn = computeTurn(azimuth, heading.heading);
    return `나침반: ${turnHeadline(turn)}`;
  }
  return `나침반, 북쪽이 위: ${facingHeadline(azimuth)}`;
}

function renderNow(state: AppState, handlers: UiHandlers, rotation: number): HTMLElement {
  const data = state.data;
  const view = h('div', { class: 'view view-now' });
  const visual = h('div', { class: 'now-visual' });
  const info = h('div', { class: 'now-info' });
  view.append(visual, info);

  if (data.kind === 'loading') {
    visual.append(buildDial({ mode: 'north-up', sunAzimuth: null, label: '나침반', idPrefix: 'sun-dial' }));
    info.append(h('h1', { class: 'headline', text: T.loading, attrs: { 'aria-live': 'polite' } }));
    return view;
  }

  if (data.kind === 'no-location') {
    visual.append(buildDial({ mode: 'north-up', sunAzimuth: null, label: '나침반', idPrefix: 'sun-dial' }));
    info.append(
      h('div', { class: 'pills' }, pill('neutral', T.headingOff)),
      h('h1', { class: 'headline', text: T.noLocationTitle }),
      h('p', { class: 'sub', text: T.noLocationBody }),
      button(T.allowLocation, handlers.onRequestLocation, 'btn btn-primary'),
    );
    return view;
  }

  const shown = readingOf(data);
  const pills = h('div', { class: 'pills' });
  const p = dataPill(state);
  pills.append(pill(p.tone, p.text));
  if (shown && state.heading.kind !== 'available') pills.append(pill('neutral', T.headingOff));
  info.append(pills);

  if (data.kind === 'failed') info.append(failureBlock(data));

  if (!shown) {
    visual.append(buildDial({ mode: 'north-up', sunAzimuth: null, label: '나침반', idPrefix: 'sun-dial' }));
    info.append(sourceRow(state, null, handlers));
    return view;
  }

  const { reading, current } = shown;
  const pos = reading.position;
  const heading = state.heading;
  const lastGoodCaption = current ? null : lastGoodLabel(formatKstTime(reading.fetchedAt));

  visual.append(
    buildDial({
      mode: heading.kind === 'available' ? 'heading-up' : 'north-up',
      heading: heading.kind === 'available' ? heading.heading : undefined,
      rotation,
      sunAzimuth: pos.azimuth,
      belowHorizon: pos.altitude < 0,
      label: dialLabel(heading, pos.azimuth),
      idPrefix: 'sun-dial',
    }),
  );
  if (!current) visual.classList.add('is-dim');

  const guide = h('div', { class: 'guide' });
  if (lastGoodCaption) guide.append(h('p', { class: 'guide-caption', text: lastGoodCaption }));
  if (heading.kind === 'available') {
    guide.append(h('h1', { class: 'headline', text: turnHeadline(computeTurn(pos.azimuth, heading.heading)) }));
  } else {
    guide.append(h('h1', { class: 'headline', text: facingHeadline(pos.azimuth) }));
  }
  guide.append(h('p', { class: 'sub', text: sunSub(pos) }));
  if (heading.kind === 'needs-permission') {
    guide.append(h('p', { class: 'note', text: T.headingNeedsPermission }));
    guide.append(button(T.allowHeading, handlers.onRequestHeading, 'btn btn-primary'));
  } else if (heading.kind === 'unavailable') {
    guide.append(h('p', { class: 'note', text: heading.reason === 'denied' ? T.headingDenied : T.headingUnsupported }));
  }
  info.append(guide);

  const dim = data.kind === 'stale' || !current;
  info.append(valueCards(reading, dim, lastGoodCaption));
  info.append(sourceRow(state, reading, handlers));
  if (data.kind === 'stale') view.classList.add('is-stale');
  return view;
}

// ---------- 기록 탭 ----------

/** 두 기록의 차이 (to − from). 방위각은 -180 초과 180 이하로 맞춘다. */
export function compareRecords(from: DailyRecord, to: DailyRecord): { azimuth: number; altitude: number } {
  let az = normalizeDegrees(to.reading.position.azimuth - from.reading.position.azimuth);
  if (az > 180) az -= 360;
  return { azimuth: az, altitude: to.reading.position.altitude - from.reading.position.altitude };
}

function comparisonResult(from: DailyRecord, to: DailyRecord): HTMLElement {
  const diff = compareRecords(from, to);
  const a = from.reading.position;
  const b = to.reading.position;
  return h(
    'div',
    { class: 'compare-result' },
    h(
      'div',
      { class: 'compare-item' },
      h('div', { class: 'value-label', text: T.azimuthChange }),
      h('div', { class: 'value-num num', text: formatSignedDegrees(diff.azimuth) }),
      h('div', { class: 'value-sub num', text: `${formatDegrees(a.azimuth)} → ${formatDegrees(b.azimuth)}` }),
    ),
    h(
      'div',
      { class: 'compare-item' },
      h('div', { class: 'value-label', text: T.altitudeChange }),
      h('div', { class: 'value-num num', text: formatSignedDegrees(diff.altitude) }),
      h('div', { class: 'value-sub num', text: `${formatDegrees(a.altitude)} → ${formatDegrees(b.altitude)}` }),
    ),
  );
}

function recordSelect(id: string, label: string, records: DailyRecord[], value: string): { wrap: HTMLElement; select: HTMLSelectElement } {
  const select = h('select', { attrs: { id } });
  for (const r of records) {
    const o = h('option', { text: formatKstDateLabel(r.kstDate) });
    o.value = r.kstDate;
    select.append(o);
  }
  select.value = value;
  const wrap = h('div', { class: 'field' }, h('label', { text: label, attrs: { for: id } }), select);
  return { wrap, select };
}

function renderCompare(root: HTMLElement, records: DailyRecord[]): HTMLElement {
  const c = card('card-compare', h('h2', { class: 'card-title', text: T.compareTitle }));
  if (records.length < 2) {
    c.append(h('p', { class: 'muted', text: T.compareNeedTwo }));
    return c;
  }
  const keys = new Set(records.map((r) => r.kstDate));
  const saved = compareSelection.get(root);
  const sel =
    saved && keys.has(saved.from) && keys.has(saved.to)
      ? saved
      : { from: records[1].kstDate, to: records[0].kstDate };

  const fromField = recordSelect('compare-from', T.compareFrom, records, sel.from);
  const toField = recordSelect('compare-to', T.compareTo, records, sel.to);
  const find = (k: string) => records.find((r) => r.kstDate === k) as DailyRecord;
  let result = comparisonResult(find(sel.from), find(sel.to));

  const update = () => {
    const next = { from: fromField.select.value, to: toField.select.value };
    compareSelection.set(root, next);
    const fresh = comparisonResult(find(next.from), find(next.to));
    result.replaceWith(fresh);
    result = fresh;
  };
  fromField.select.addEventListener('change', update);
  toField.select.addEventListener('change', update);

  c.append(h('div', { class: 'compare-fields' }, fromField.wrap, toField.wrap), result);
  return c;
}

function renderRecords(root: HTMLElement, state: AppState, handlers: UiHandlers): HTMLElement {
  const records = [...state.records].sort((a, b) => (a.kstDate < b.kstDate ? 1 : a.kstDate > b.kstDate ? -1 : 0));
  const view = h('div', { class: 'view view-records' });

  const listCard = card(
    'card-records',
    h('h1', { class: 'card-title title-lg', text: T.recordsTitle }),
    h('p', { class: 'muted', text: T.recordsSubtitle }),
  );
  if (records.length === 0) {
    listCard.append(h('p', { class: 'empty', text: T.recordsEmpty }));
  } else {
    const table = h('table', { class: 'records-table' });
    const head = h('tr');
    for (const t of ['날짜', '조회 시각', '방위각', '고도', '출처']) head.append(h('th', { text: t, attrs: { scope: 'col' } }));
    table.append(h('thead', {}, head));
    const body = h('tbody');
    for (const r of records) {
      body.append(
        h(
          'tr',
          {},
          h('th', { text: formatKstDateLabel(r.kstDate), attrs: { scope: 'row' } }),
          h('td', { class: 'num', text: `${formatKstTime(r.reading.fetchedAt)} KST 조회` }),
          h('td', { class: 'num', text: formatDegrees(r.reading.position.azimuth) }),
          h('td', { class: 'num', text: formatDegrees(r.reading.position.altitude) }),
          h('td', { text: r.reading.source }),
        ),
      );
    }
    table.append(body);
    listCard.append(h('div', { class: 'table-wrap' }, table));
  }

  const exportBtn = button(T.recordsExport, handlers.onExportRecords, 'btn btn-secondary');
  if (records.length === 0) exportBtn.disabled = true;
  listCard.append(h('div', { class: 'records-actions' }, exportBtn, h('p', { class: 'note', text: T.recordsNote })));

  view.append(listCard, renderCompare(root, records));
  return view;
}

// ---------- 상태 탭 ----------

function renderStatusCard(state: AppState): HTMLElement {
  const d = state.data;
  const p = dataPill(state);
  let headline: string;
  if (d.kind === 'fresh' || d.kind === 'cached' || d.kind === 'stale') headline = statusHeadline(d.kind);
  else if (d.kind === 'failed') headline = failureMessage(d.failure);
  else if (d.kind === 'no-location') headline = T.noLocationTitle;
  else headline = T.loading;

  const c = card('card-status', h('div', { class: 'pills' }, pill(p.tone, p.text)), h('h1', { class: 'headline headline-sm', text: headline }));
  const dl = h('dl', { class: 'kv-list' });
  dl.append(row(T.sourceLabel, T.sourceFull));
  const shown = readingOf(d);
  if (shown) {
    const at = shown.reading.fetchedAt;
    dl.append(row(T.fetchedAt, `${formatKstTime(at)} KST (${formatElapsed(at, state.now)})`));
  }
  if (d.kind === 'failed') {
    if (d.nextAttemptAt) dl.append(row(T.nextAttempt, `${formatKstTime(d.nextAttemptAt)} KST`));
  } else if (state.nextRefreshAt && shown) {
    dl.append(row(T.nextRefresh, `${formatKstTime(state.nextRefreshAt)} KST (${minutesLater(minutesUntil(state.nextRefreshAt, state.now))})`));
  }
  if (d.kind === 'fresh' || d.kind === 'cached') {
    const staleAt = new Date(Date.parse(d.reading.fetchedAt) + STALE_AFTER_MS).toISOString();
    dl.append(row(T.untilStale, minutesLeft(minutesUntil(staleAt, state.now))));
  }
  c.append(dl);
  return c;
}

function renderLastGoodCard(state: AppState): HTMLElement {
  const c = card('card-lastgood', h('h2', { class: 'card-title', text: T.lastGood }));
  const shown = readingOf(state.data);
  if (!shown) {
    c.append(h('p', { class: 'muted', text: '없음' }));
    return c;
  }
  const r = shown.reading;
  const dl = h('dl', { class: 'kv-list' });
  dl.append(
    row(T.azimuth, `${formatDegrees(r.position.azimuth)} (${compassPoint(r.position.azimuth)}쪽)`),
    row(T.altitude, formatDegrees(r.position.altitude)),
    row(T.fetchedAt, `${formatKstTime(r.fetchedAt)} KST`),
    row(T.sourceLabel, r.source),
  );
  c.append(dl);
  return c;
}

function renderDeviceCard(state: AppState): HTMLElement {
  const d = state.data;
  let location: string;
  if (d.kind === 'no-location') location = d.reason === 'denied' ? '위치 권한이 없어요' : '위치를 확인하지 못했어요';
  else if (d.kind === 'loading') location = T.checking;
  else location = '위치 확인됨 (약 1km 단위로 반올림)';

  const hs = state.heading;
  let heading: string;
  if (hs.kind === 'available') heading = headingActive(hs.heading);
  else if (hs.kind === 'needs-permission') heading = `${T.headingOff} (허용 필요)`;
  else heading = `${T.headingOff} (${hs.reason === 'denied' ? '권한 거부' : '센서 없음'})`;

  const dl = h('dl', { class: 'kv-list' }, row(T.location, location), row(T.heading, heading));
  return card('card-device', h('h2', { class: 'card-title', text: T.device }), dl);
}

function logTone(outcome: RequestLogEntry['outcome']): Tone {
  if (outcome === 'success') return 'fresh';
  if (outcome === 'failure') return 'error';
  return 'cached';
}

function renderLogCard(state: AppState): HTMLElement {
  const c = card('card-log', h('h2', { class: 'card-title', text: T.requestLog }));
  if (state.requestLog.length === 0) {
    c.append(h('p', { class: 'muted', text: T.requestLogEmpty }));
    return c;
  }
  const list = h('ul', { class: 'log-list' });
  const entries = [...state.requestLog].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  for (const e of entries) {
    const detail = e.failure ? `${triggerLabel(e.trigger)} · ${attemptsText(e.attempts)} · ${failureMessage(e.failure)}` : `${triggerLabel(e.trigger)} · ${attemptsText(e.attempts)}`;
    list.append(
      h(
        'li',
        { class: 'log-item' },
        h('span', { class: 'log-time num', text: formatKstTime(e.at) }),
        pill(logTone(e.outcome), outcomeLabel(e.outcome)),
        h('span', { class: 'log-detail', text: detail }),
      ),
    );
  }
  c.append(list);
  return c;
}

function renderStatus(state: AppState): HTMLElement {
  return h(
    'div',
    { class: 'view view-status' },
    h('div', { class: 'col' }, renderStatusCard(state), renderLastGoodCard(state), renderDeviceCard(state)),
    h('div', { class: 'col' }, renderLogCard(state)),
  );
}

// ---------- 진입점 ----------

interface Mounted {
  app: HTMLElement;
  header: HTMLElement;
  main: HTMLElement;
  /** 이미 그려진 버튼들이 항상 최신 handlers를 부르도록 거치는 객체 */
  handlers: UiHandlers;
  latest: UiHandlers;
  /** 다이얼 판의 누적 회전 각도. 359°→1°에서 먼 쪽으로 돌지 않게 한다 */
  rotation: number;
}

const mounted = new WeakMap<HTMLElement, Mounted>();

function forwardingHandlers(get: () => UiHandlers): UiHandlers {
  return {
    onTabChange: (tab) => get().onTabChange(tab),
    onRefresh: () => get().onRefresh(),
    onRequestHeading: () => get().onRequestHeading(),
    onRequestLocation: () => get().onRequestLocation(),
    onExportRecords: () => get().onExportRecords(),
  };
}

/** 새로 만든 영역이 기존과 표시상 같으면 기존 요소를 그대로 둔다 (포커스·열린 select 유지) */
function patch(current: HTMLElement, next: HTMLElement): HTMLElement {
  if (current.isEqualNode(next)) return current;
  current.replaceWith(next);
  return next;
}

// 사용자 동작을 받는 요소. 모양만 같다고 기존 요소를 재사용하면 다른 동작이 연결될 수 있으므로 완전히 같아야 한다
const INTERACTIVE = new Set(['BUTTON', 'SELECT', 'INPUT', 'TEXTAREA', 'A']);

/** 두 트리의 요소 구성(태그와 자식 순서)이 같은지. 값과 속성은 보지 않는다 */
function sameShape(a: Node, b: Node): boolean {
  if (a.nodeType !== b.nodeType || a.nodeName !== b.nodeName) return false;
  if (!(a instanceof Element)) return true;
  if (INTERACTIVE.has(a.tagName)) return a.isEqualNode(b);
  // 자식 구성이 바뀌어도 되는 묶음 (다이얼의 회전 호)
  if (a.getAttribute('data-morph') === 'children') return true;
  const ac = a.childNodes;
  const bc = b.childNodes;
  if (ac.length !== bc.length) return false;
  for (let i = 0; i < ac.length; i++) if (!sameShape(ac[i], bc[i])) return false;
  return true;
}

/** 구성이 같은 기존 트리에 새 속성과 글자만 옮긴다. 요소가 유지되어 CSS transition이 동작한다 */
function morph(current: Node, next: Node): void {
  if (!(current instanceof Element) || !(next instanceof Element)) {
    if (current.nodeValue !== next.nodeValue) current.nodeValue = next.nodeValue;
    return;
  }
  if (INTERACTIVE.has(current.tagName)) return;
  for (const attr of [...current.attributes]) {
    if (!next.hasAttribute(attr.name)) current.removeAttribute(attr.name);
  }
  for (const attr of [...next.attributes]) {
    if (current.getAttribute(attr.name) !== attr.value) current.setAttribute(attr.name, attr.value);
  }
  if (current.getAttribute('data-morph') === 'children') {
    if (!current.isEqualNode(next)) current.replaceChildren(...next.childNodes);
    return;
  }
  const cc = current.childNodes;
  const nc = next.childNodes;
  for (let i = 0; i < cc.length; i++) morph(cc[i], nc[i]);
}

/** 지금 탭: 구성이 같으면 기존 요소를 고쳐 쓰고(다이얼이 부드럽게 돈다), 다르면 교체한다 */
function patchInPlace(current: HTMLElement, next: HTMLElement): HTMLElement {
  if (current.isEqualNode(next)) return current;
  if (!sameShape(current, next)) {
    current.replaceWith(next);
    return next;
  }
  morph(current, next);
  return current;
}

/** 이번에 그릴 다이얼 판 회전 각도. 이전 각도에서 가장 짧게 도는 쪽으로 누적한다 */
function nextRotation(prev: number | undefined, heading: HeadingStatus): number {
  const target = heading.kind === 'available' ? -heading.heading : 0;
  if (prev === undefined) return target;
  return unwrapRotation(prev, target);
}

export function render(root: HTMLElement, state: AppState, handlers: UiHandlers): void {
  let m = mounted.get(root);
  if (m && !root.contains(m.app)) m = undefined;
  const fwd = m?.handlers ?? forwardingHandlers(() => mounted.get(root)!.latest);

  const rotation = nextRotation(m?.rotation, state.heading);

  let view: HTMLElement;
  if (state.tab === 'records') view = renderRecords(root, state, fwd);
  else if (state.tab === 'status') view = renderStatus(state);
  else view = renderNow(state, fwd, rotation);

  const header = renderHeader(state, fwd);
  const main = h('main', { class: 'content', attrs: { 'data-tab': state.tab } }, view);

  if (!m) {
    const app = h('div', { class: 'app' }, header, main);
    root.replaceChildren(app);
    mounted.set(root, { app, header, main, handlers: fwd, latest: handlers, rotation });
    return;
  }
  m.latest = handlers;
  m.rotation = rotation;
  m.header = patch(m.header, header);
  const nowToNow = state.tab === 'now' && m.main.getAttribute('data-tab') === 'now';
  m.main = nowToNow ? patchInPlace(m.main, main) : patch(m.main, main);
}
