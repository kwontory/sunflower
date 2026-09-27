// 나침반 다이얼 SVG (viewBox 0 0 300 300)
import { computeTurn } from '../core/direction';

const NS = 'http://www.w3.org/2000/svg';
const C = 150;
const RAYS: ReadonlyArray<readonly [number, number]> = [
  [23, 2.6], [19.5, 1.8], [22, 2.4], [19, 1.6], [23, 2.6], [20, 1.8],
  [22.5, 2.4], [19, 1.6], [23, 2.6], [19.5, 1.8], [22, 2.4], [20, 1.6],
];

let dialSeq = 0;

/** 회전 애니메이션 시간. 컨트롤러의 방향 갱신 간격(250ms)과 비슷하게 맞춰 끊김 없이 이어지게 한다 */
export const DIAL_TRANSITION_MS = 300;

export interface DialOptions {
  /** heading-up: 기기 앞쪽이 위. north-up: 북쪽이 위. */
  mode: 'heading-up' | 'north-up';
  /** 해 방위각. null이면 해를 그리지 않는다. */
  sunAzimuth: number | null;
  /** heading-up일 때 기기가 향한 방향 */
  heading?: number;
  /**
   * 나침반 판의 회전 각도(시계 방향). 기본값은 -heading (north-up은 0).
   * 359°→1°처럼 경계를 넘을 때 먼 쪽으로 돌지 않도록 누적 각도를 줄 수 있다.
   */
  rotation?: number;
  /** false면 회전 애니메이션을 넣지 않는다. 기본값은 사용자의 동작 줄이기 설정을 따른다 */
  animate?: boolean;
  /** 해가 지평선 아래일 때 흐리게 */
  belowHorizon?: boolean;
  label: string;
  /** 그라데이션 id 접두어. 한 화면에 다이얼이 하나뿐이면 고정값을 줘서 다시 그려도 같은 결과가 나오게 한다 */
  idPrefix?: string;
}

/** 사용자가 동작 줄이기를 켰는지. matchMedia가 없는 환경(jsdom 등)에서는 false */
export function prefersReducedMotion(): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;
  } catch {
    return false;
  }
}

/** prev에서 target 방향으로 가장 짧게 도는 누적 각도. 결과를 360으로 나눈 나머지는 target과 같다 */
export function unwrapRotation(prev: number, target: number): number {
  let diff = (((target - prev) % 360) + 360) % 360;
  if (diff > 180) diff -= 360;
  return round(prev + diff);
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/** 화면 각도(위=0, 시계 방향)와 반지름으로 좌표 계산 */
export function polar(angleDeg: number, r: number): { x: number; y: number } {
  const a = (angleDeg * Math.PI) / 180;
  return { x: round(C + r * Math.sin(a)), y: round(C - r * Math.cos(a)) };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function buildSun(id: string, x: number, y: number, dim: boolean): SVGGElement {
  const g = el('g', { transform: `translate(${x} ${y})`, class: dim ? 'dial-sun is-below' : 'dial-sun' });
  g.append(el('circle', { r: 30, fill: `url(#${id}-glow)` }));
  const rays = el('g', { stroke: '#E8961A', 'stroke-linecap': 'round' });
  RAYS.forEach(([len, w], i) => {
    rays.append(
      el('line', { x1: 0, y1: -15, x2: 0, y2: -len, 'stroke-width': w, transform: `rotate(${i * 30})` }),
    );
  });
  g.append(rays);
  g.append(el('circle', { r: 12, fill: `url(#${id}-disc)`, stroke: '#D07A0C', 'stroke-width': 1 }));
  return g;
}

function buildDefs(id: string): SVGDefsElement {
  const defs = el('defs');
  const glow = el('radialGradient', { id: `${id}-glow`, cx: 0.5, cy: 0.5, r: 0.5 });
  glow.append(
    el('stop', { offset: 0, 'stop-color': '#FFC94A', 'stop-opacity': 0.55 }),
    el('stop', { offset: 0.55, 'stop-color': '#F7B23A', 'stop-opacity': 0.22 }),
    el('stop', { offset: 1, 'stop-color': '#F7B23A', 'stop-opacity': 0 }),
  );
  const disc = el('radialGradient', { id: `${id}-disc`, cx: 0.42, cy: 0.4, r: 0.62 });
  disc.append(
    el('stop', { offset: 0, 'stop-color': '#FFF4C2' }),
    el('stop', { offset: 0.45, 'stop-color': '#FFD35C' }),
    el('stop', { offset: 0.85, 'stop-color': '#F4A423' }),
    el('stop', { offset: 1, 'stop-color': '#E08A12' }),
  );
  defs.append(glow, disc);
  return defs;
}

/** CSS 회전. 속성(transform)이 아니라 style로 줘야 transition이 동작한다 */
function rotateStyle(deg: number, origin: string, animate: boolean): string {
  const base = `transform: rotate(${round(deg)}deg); transform-origin: ${origin}; transform-box: view-box;`;
  return animate ? `${base} transition: transform ${DIAL_TRANSITION_MS}ms ease-out;` : base;
}

export function buildDial(opts: DialOptions): SVGSVGElement {
  const id = opts.idPrefix ?? `dial${++dialSeq}`;
  const headingUp = opts.mode === 'heading-up' && opts.heading !== undefined;
  const heading = headingUp ? (opts.heading as number) : 0;
  const rotation = opts.rotation ?? (headingUp ? -heading : 0);
  const animate = opts.animate ?? !prefersReducedMotion();

  const svg = el('svg', { viewBox: '0 0 300 300', role: 'img', 'aria-label': opts.label, class: 'dial' });
  svg.dataset.mode = headingUp ? 'heading-up' : 'north-up';
  svg.append(buildDefs(id));
  svg.append(el('circle', { cx: C, cy: C, r: 136, class: 'dial-outer' }));
  svg.append(el('circle', { cx: C, cy: C, r: 100, class: 'dial-inner' }));

  // 회전 호: 기기 앞쪽에서 해까지. 판과 따로 두고 매번 다시 계산한다.
  // 호가 생기거나 사라져도 다이얼 구조가 바뀌지 않도록 묶음은 항상 둔다.
  const arcLayer = el('g', { class: 'dial-arc-layer', 'data-morph': 'children' });
  svg.append(arcLayer);
  if (headingUp && opts.sunAzimuth !== null && !opts.belowHorizon) {
    const turn = computeTurn(opts.sunAzimuth, heading);
    if (turn.direction !== 'front') {
      const signed = turn.direction === 'right' ? turn.degrees : -turn.degrees;
      const start = polar(0, 60);
      const end = polar(signed, 60);
      const sweep = signed > 0 ? 1 : 0;
      arcLayer.append(
        el('path', { d: `M${start.x} ${start.y} A60 60 0 0 ${sweep} ${end.x} ${end.y}`, class: 'dial-arc' }),
      );
    }
  }

  // 나침반 판: 북쪽 기준으로 그린 뒤 통째로 돌린다
  const rotor = el('g', { class: 'dial-rotor', style: rotateStyle(rotation, `${C}px ${C}px`, animate) });
  (['N', 'E', 'S', 'W'] as const).forEach((letter, i) => {
    const p = polar(i * 90, 118);
    // 글자는 제자리에서 반대로 돌려 항상 똑바로 서 있게 한다
    const pos = el('g', { transform: `translate(${p.x} ${p.y})` });
    const t = el('text', {
      x: 0,
      y: 0,
      class: letter === 'N' ? 'dial-letter is-north' : 'dial-letter',
      'text-anchor': 'middle',
      'dominant-baseline': 'central',
      style: rotateStyle(-rotation, '0px 0px', animate),
    });
    t.textContent = letter;
    pos.append(t);
    rotor.append(pos);
  });

  if (opts.sunAzimuth !== null) {
    const sun = polar(opts.sunAzimuth, 88);
    rotor.append(el('line', { x1: C, y1: C, x2: sun.x, y2: sun.y, class: 'dial-sunline' }));
    rotor.append(buildSun(id, sun.x, sun.y, opts.belowHorizon === true));
  }
  svg.append(rotor);

  if (headingUp) {
    svg.append(el('line', { x1: C, y1: C, x2: 150, y2: 36, class: 'dial-pointer' }));
    svg.append(el('path', { d: 'M141 8 L159 8 L150 22 Z', class: 'dial-notch' }));
  }
  svg.append(el('circle', { cx: C, cy: C, r: 3.5, class: 'dial-center' }));
  return svg;
}
