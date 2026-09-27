// Sunflower 서비스 워커: 오프라인에서도 앱 화면(셸)을 열 수 있게 한다.
// - 같은 출처의 GET 요청만 다룬다. 외부 API(USNO)는 가로채지 않는다.
// - 페이지(navigate)는 네트워크 우선, /assets/*는 캐시 우선.
// 배포 구조를 바꿔 기존 캐시를 버려야 할 때 버전을 올린다.
const CACHE_NAME = 'sunflower-shell-v1';
const CACHE_PREFIX = 'sunflower-';
const SHELL_KEY = '/';
const NAVIGATION_TIMEOUT_MS = 4000;

/** 요청을 서비스 워커가 처리할지와 방식을 정한다: 'navigate' | 'asset' | null */
function chooseStrategy(request, origin) {
  if (request.method !== 'GET') return null;
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return null;
  }
  if (url.origin !== origin) return null;
  if (request.mode === 'navigate') return 'navigate';
  if (url.pathname.startsWith('/assets/')) return 'asset';
  return null;
}

/** 캐시에 넣어도 되는 응답인지: 정상(200) + 같은 출처 + 리다이렉트 아님 */
function isCacheable(response) {
  return (
    !!response &&
    response.status === 200 &&
    response.type === 'basic' &&
    !response.redirected
  );
}

/** index.html에서 /assets/ 아래 JS, CSS 주소를 뽑는다 */
function extractShellAssets(html) {
  const urls = new Set();
  const re = /(?:src|href)=["'](\/assets\/[^"'?#]+\.(?:js|css))["']/g;
  let m;
  while ((m = re.exec(html)) !== null) urls.add(m[1]);
  return [...urls];
}

async function precacheShell() {
  try {
    const cache = await caches.open(CACHE_NAME);
    const res = await fetch(SHELL_KEY, { cache: 'no-cache' });
    if (!isCacheable(res)) return;
    const html = await res.clone().text();
    await cache.put(SHELL_KEY, res);
    await Promise.all(
      extractShellAssets(html).map(async (path) => {
        try {
          const assetRes = await fetch(path);
          if (isCacheable(assetRes)) await cache.put(path, assetRes);
        } catch {
          // 일부 파일을 못 받아도 설치는 계속한다
        }
      }),
    );
  } catch {
    // 미리 받기 실패는 무시한다 (다음 방문 때 채워진다)
  }
}

async function deleteOldCaches() {
  const keys = await caches.keys();
  await Promise.all(
    keys
      .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
      .map((key) => caches.delete(key)),
  );
}

async function cachedShell() {
  const cache = await caches.open(CACHE_NAME);
  return cache.match(SHELL_KEY);
}

async function handleNavigate(request) {
  const network = fetch(request).then(async (res) => {
    if (isCacheable(res)) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(SHELL_KEY, res.clone());
    }
    return res;
  });

  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve('timeout'), NAVIGATION_TIMEOUT_MS);
  });

  try {
    const first = await Promise.race([network, timeout]);
    if (first !== 'timeout') return first;
    // 시간 초과: 저장된 셸이 있으면 보여주고, 없으면 네트워크를 계속 기다린다
    const shell = await cachedShell();
    if (shell) {
      network.catch(() => {});
      return shell;
    }
    return await network;
  } catch {
    const shell = await cachedShell();
    return shell || Response.error();
  } finally {
    clearTimeout(timer);
  }
}

async function handleAsset(request) {
  const cache = await caches.open(CACHE_NAME);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (isCacheable(res)) await cache.put(request, res.clone());
  return res;
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(precacheShell());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(deleteOldCaches().then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const strategy = chooseStrategy(event.request, self.location.origin);
  if (strategy === 'navigate') event.respondWith(handleNavigate(event.request));
  else if (strategy === 'asset') event.respondWith(handleAsset(event.request));
  // 그 밖의 요청(외부 API 등)은 가로채지 않고 브라우저가 그대로 처리한다
});
