import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// public/sw.js를 가짜 self, caches, fetch와 함께 실행해서 로직을 확인한다
const ORIGIN = 'https://sunflower.example';
import source from '../../public/sw.js?raw';

type Listener = (event: unknown) => void;

function makeCaches() {
  const stores = new Map<string, Map<string, Response>>();
  const keyOf = (req: Request | string) => new URL(typeof req === 'string' ? req : req.url, ORIGIN).href;
  const open = async (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name)!;
    return {
      match: async (req: Request | string) => store.get(keyOf(req))?.clone(),
      put: async (req: Request | string, res: Response) => void store.set(keyOf(req), res),
    };
  };
  return {
    stores,
    api: {
      open,
      keys: async () => [...stores.keys()],
      delete: async (name: string) => stores.delete(name),
    },
  };
}

// Response.type과 redirected는 생성자로 정할 수 없어서 덮어쓴다
function res(body: string, init: { status?: number; type?: string; redirected?: boolean } = {}) {
  const r = new Response(body, { status: init.status ?? 200 });
  Object.defineProperty(r, 'type', { value: init.type ?? 'basic' });
  Object.defineProperty(r, 'redirected', { value: init.redirected ?? false });
  return r;
}

function navRequest(path = '/') {
  const req = new Request(ORIGIN + path);
  Object.defineProperty(req, 'mode', { value: 'navigate' });
  return req;
}

function load(fetchImpl: (input: Request | string) => Promise<Response>) {
  const listeners: Record<string, Listener> = {};
  const caches = makeCaches();
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, fn: Listener) => void (listeners[type] = fn),
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn(async () => {}) },
  };
  const fetchMock = vi.fn(fetchImpl);
  const helpers = new Function(
    'self',
    'caches',
    'fetch',
    `${source}\nreturn { chooseStrategy, isCacheable, extractShellAssets, CACHE_NAME };`,
  )(self, caches.api, fetchMock);

  const dispatchFetch = (request: Request) => {
    let responded: Promise<Response> | undefined;
    listeners.fetch({ request, respondWith: (p: Promise<Response>) => (responded = p) });
    return responded;
  };
  const runLifecycle = async (type: 'install' | 'activate') => {
    let waited: Promise<unknown> = Promise.resolve();
    listeners[type]({ waitUntil: (p: Promise<unknown>) => (waited = p) });
    await waited;
  };
  return { helpers, self, caches, fetchMock, dispatchFetch, runLifecycle };
}

const shellStore = (c: ReturnType<typeof makeCaches>, name: string) => c.stores.get(name);

describe('서비스 워커 순수 로직', () => {
  const { helpers } = load(async () => res(''));

  it('같은 출처 GET만 처리하고 외부 API는 가로채지 않는다', () => {
    expect(helpers.chooseStrategy(navRequest('/'), ORIGIN)).toBe('navigate');
    expect(helpers.chooseStrategy(new Request(ORIGIN + '/assets/index-abc.js'), ORIGIN)).toBe('asset');
    expect(helpers.chooseStrategy(new Request(ORIGIN + '/sw.js'), ORIGIN)).toBeNull();
    expect(
      helpers.chooseStrategy(new Request('https://aa.usno.navy.mil/api/celnav?date=2026-09-27'), ORIGIN),
    ).toBeNull();
    expect(
      helpers.chooseStrategy(new Request(ORIGIN + '/assets/x.js', { method: 'POST', body: 'a' }), ORIGIN),
    ).toBeNull();
  });

  it('정상 200 + 같은 출처 + 리다이렉트 아님만 캐시한다', () => {
    expect(helpers.isCacheable(res('ok'))).toBe(true);
    expect(helpers.isCacheable(res('', { status: 404 }))).toBe(false);
    expect(helpers.isCacheable(res('', { status: 500 }))).toBe(false);
    expect(helpers.isCacheable(res('', { type: 'opaque' }))).toBe(false);
    expect(helpers.isCacheable(res('', { type: 'opaqueredirect' }))).toBe(false);
    expect(helpers.isCacheable(res('login', { redirected: true }))).toBe(false);
    expect(helpers.isCacheable(undefined)).toBe(false);
  });

  it('index.html에서 /assets/ JS, CSS 주소를 뽑는다', () => {
    const html = `<!doctype html><html><head>
      <script type="module" crossorigin src="/assets/index-AbC123.js"></script>
      <link rel="modulepreload" crossorigin href="/assets/vendor-x1.js">
      <link rel="stylesheet" crossorigin href="/assets/index-Def456.css">
      <link rel="icon" href="/favicon.svg">
      <script src="https://aa.usno.navy.mil/evil.js"></script>
      </head></html>`;
    expect(helpers.extractShellAssets(html).sort()).toEqual([
      '/assets/index-AbC123.js',
      '/assets/index-Def456.css',
      '/assets/vendor-x1.js',
    ]);
  });
});

describe('서비스 워커 동작', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('외부 요청에는 respondWith를 호출하지 않는다', () => {
    const sw = load(async () => res(''));
    expect(sw.dispatchFetch(new Request('https://aa.usno.navy.mil/api/rstt/oneday'))).toBeUndefined();
    expect(sw.fetchMock).not.toHaveBeenCalled();
  });

  it('설치 시 셸과 셸이 참조하는 JS, CSS를 미리 받고 즉시 활성화한다', async () => {
    const html = '<script src="/assets/a.js"></script><link href="/assets/b.css">';
    const sw = load(async (input) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url === '/') return res(html);
      if (url === '/assets/a.js') return res('js');
      return res('', { status: 404 });
    });
    await sw.runLifecycle('install');
    expect(sw.self.skipWaiting).toHaveBeenCalled();
    const store = shellStore(sw.caches, sw.helpers.CACHE_NAME)!;
    expect([...store.keys()].sort()).toEqual([ORIGIN + '/', ORIGIN + '/assets/a.js']);
  });

  it('설치 중 네트워크 실패는 무시한다', async () => {
    const sw = load(async () => {
      throw new TypeError('offline');
    });
    await expect(sw.runLifecycle('install')).resolves.toBeUndefined();
  });

  it('활성화 시 이전 버전 캐시만 지우고 페이지를 넘겨받는다', async () => {
    const sw = load(async () => res(''));
    await sw.caches.api.open('sunflower-shell-v0');
    await sw.caches.api.open(sw.helpers.CACHE_NAME);
    await sw.caches.api.open('other-app');
    await sw.runLifecycle('activate');
    expect([...sw.caches.stores.keys()].sort()).toEqual(['other-app', sw.helpers.CACHE_NAME].sort());
    expect(sw.self.clients.claim).toHaveBeenCalled();
  });

  it('페이지 요청: 온라인이면 최신 응답을 주고 셸로 저장한다', async () => {
    const sw = load(async () => res('new'));
    const cache = await sw.caches.api.open(sw.helpers.CACHE_NAME);
    await cache.put('/', res('old'));
    const response = await sw.dispatchFetch(navRequest('/'))!;
    expect(await response.text()).toBe('new');
    expect(await (await cache.match('/'))!.text()).toBe('new');
  });

  it('페이지 요청: 리다이렉트(로그인 보호 등)나 오류 응답은 셸로 저장하지 않는다', async () => {
    for (const bad of [res('login', { redirected: true }), res('err', { status: 500 })]) {
      const sw = load(async () => bad);
      const cache = await sw.caches.api.open(sw.helpers.CACHE_NAME);
      await cache.put('/', res('shell'));
      const response = await sw.dispatchFetch(navRequest('/'))!;
      expect(response).toBe(bad);
      expect(await (await cache.match('/'))!.text()).toBe('shell');
    }
  });

  it('페이지 요청: 오프라인이면 저장된 셸을 준다', async () => {
    const sw = load(async () => {
      throw new TypeError('offline');
    });
    const cache = await sw.caches.api.open(sw.helpers.CACHE_NAME);
    await cache.put('/', res('shell'));
    const response = await sw.dispatchFetch(navRequest('/?x=1'))!;
    expect(await response.text()).toBe('shell');
  });

  it('페이지 요청: 오프라인이고 셸도 없으면 오류 응답', async () => {
    const sw = load(async () => {
      throw new TypeError('offline');
    });
    const response = await sw.dispatchFetch(navRequest('/'))!;
    expect(response.type).toBe('error');
  });

  it('페이지 요청: 네트워크가 4초 넘게 걸리면 저장된 셸을 준다', async () => {
    const sw = load(() => new Promise<Response>(() => {}));
    const cache = await sw.caches.api.open(sw.helpers.CACHE_NAME);
    await cache.put('/', res('shell'));
    const pending = sw.dispatchFetch(navRequest('/'))!;
    await vi.advanceTimersByTimeAsync(4000);
    expect(await (await pending).text()).toBe('shell');
  });

  it('페이지 요청: 시간 초과여도 셸이 없으면 네트워크를 계속 기다린다', async () => {
    let resolveNet!: (r: Response) => void;
    const sw = load(() => new Promise<Response>((r) => (resolveNet = r)));
    const pending = sw.dispatchFetch(navRequest('/'))!;
    await vi.advanceTimersByTimeAsync(5000);
    resolveNet(res('late'));
    expect(await (await pending).text()).toBe('late');
  });

  it('/assets/: 캐시에 있으면 네트워크 없이 캐시를 준다', async () => {
    const sw = load(async () => res('net'));
    const cache = await sw.caches.api.open(sw.helpers.CACHE_NAME);
    await cache.put('/assets/font-a.woff2', res('cached'));
    const response = await sw.dispatchFetch(new Request(ORIGIN + '/assets/font-a.woff2'))!;
    expect(await response.text()).toBe('cached');
    expect(sw.fetchMock).not.toHaveBeenCalled();
  });

  it('/assets/: 없으면 받아서 저장하고, 오류 응답은 저장하지 않는다', async () => {
    const sw = load(async (input) => {
      const url = typeof input === 'string' ? input : input.url;
      return url.endsWith('ok.woff2') ? res('font') : res('', { status: 404 });
    });
    const cache = await sw.caches.api.open(sw.helpers.CACHE_NAME);
    await sw.dispatchFetch(new Request(ORIGIN + '/assets/ok.woff2'));
    await sw.dispatchFetch(new Request(ORIGIN + '/assets/missing.woff2'));
    expect(await (await cache.match('/assets/ok.woff2'))!.text()).toBe('font');
    expect(await cache.match('/assets/missing.woff2')).toBeUndefined();
  });
});
