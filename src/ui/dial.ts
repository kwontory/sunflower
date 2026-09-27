// 나침반 다이얼 SVG (viewBox 0 0 300 300)
import { computeTurn } from '../core/direction';

const NS = 'http://www.w3.org/2000/svg';
const C = 150;
const RAYS: ReadonlyArray<readonly [number, number]> = [
  [23, 2.6], [19.5, 1.8], [22, 2.4], [19, 1.6], [23, 2.6], [20, 1.8],
  [22.5, 2.4], [19, 1.6], [23, 2.6], [19.5, 1.8], [22, 2.4], [20, 1.6],
];

let dialSeq = 0;

export interface DialOptions {
  /** heading-up: 기기 앞쪽이 위. north-up: 북쪽이 위. */
  mode: 'heading-up' | 'north-up';
  /** 해 방위각. null이면 해를 그리지 않는다. */
  sunAzimuth: number | null;
  /** heading-up일 때 기기가 향한 방향 */
  heading?: number;
  /** 해가 지평선 아래일 때 흐리게 */
  belowHorizon?: boolean;
  label: string;
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

export function buildDial(opts: DialOptions): SVGSVGElement {
  const id = `dial${++dialSeq}`;
  const headingUp = opts.mode === 'heading-up' && opts.heading !== undefined;
  const rotation = headingUp ? (opts.heading as number) : 0;

  const svg = el('svg', { viewBox: '0 0 300 300', role: 'img', 'aria-label': opts.label, class: 'dial' });
  svg.dataset.mode = headingUp ? 'heading-up' : 'north-up';
  svg.append(buildDefs(id));
  svg.append(el('circle', { cx: C, cy: C, r: 136, class: 'dial-outer' }));
  svg.append(el('circle', { cx: C, cy: C, r: 100, class: 'dial-inner' }));

  (['N', 'E', 'S', 'W'] as const).forEach((letter, i) => {
    const p = polar(i * 90 - rotation, 118);
    const t = el('text', {
      x: p.x,
      y: p.y,
      class: letter === 'N' ? 'dial-letter is-north' : 'dial-letter',
      'text-anchor': 'middle',
      'dominant-baseline': 'central',
    });
    t.textContent = letter;
    svg.append(t);
  });

  if (opts.sunAzimuth !== null) {
    const sunAngle = opts.sunAzimuth - rotation;
    const sun = polar(sunAngle, 88);

    if (headingUp) {
      const turn = computeTurn(opts.sunAzimuth, rotation);
      if (turn.direction !== 'front') {
        const signed = turn.direction === 'right' ? turn.degrees : -turn.degrees;
        const start = polar(0, 60);
        const end = polar(signed, 60);
        const sweep = signed > 0 ? 1 : 0;
        svg.append(
          el('path', { d: `M${start.x} ${start.y} A60 60 0 0 ${sweep} ${end.x} ${end.y}`, class: 'dial-arc' }),
        );
      }
    }
    svg.append(el('line', { x1: C, y1: C, x2: sun.x, y2: sun.y, class: 'dial-sunline' }));
    svg.append(buildSun(id, sun.x, sun.y, opts.belowHorizon === true));
  }

  if (headingUp) {
    svg.append(el('line', { x1: C, y1: C, x2: 150, y2: 36, class: 'dial-pointer' }));
    svg.append(el('path', { d: 'M141 8 L159 8 L150 22 Z', class: 'dial-notch' }));
  }
  svg.append(el('circle', { cx: C, cy: C, r: 3.5, class: 'dial-center' }));
  return svg;
}
