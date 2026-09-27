// 서체는 앱에 포함해서 제공한다 (외부 서체 서버로 사용자 IP가 전송되지 않게)
import '@fontsource/ibm-plex-sans-kr/400.css';
import '@fontsource/ibm-plex-sans-kr/500.css';
import '@fontsource/ibm-plex-sans-kr/600.css';
import '@fontsource/ibm-plex-sans-kr/700.css';
import '@fontsource/sora/600.css';
import './styles.css';
import { createController } from './app/controller';
import { requestLocation } from './sensors/location';
import { browserHeadingEnvironment, createHeadingSource } from './sensors/heading';
import { createStore } from './storage/store';
import { render } from './ui/render';

const root = document.getElementById('app');
if (!root) throw new Error('#app 요소가 없습니다');

function safeLocalStorage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  try {
    return window.localStorage;
  } catch {
    // 저장소를 쓸 수 없는 환경에서는 기록 없이 동작한다
    return { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  }
}

function downloadJson(filename: string, json: string) {
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const controller = createController({
  fetch: (input, init) => window.fetch(input, init),
  now: () => new Date(),
  sleep: (ms) => new Promise((resolve) => window.setTimeout(resolve, ms)),
  random: Math.random,
  setTimer: (handler, ms) => window.setTimeout(handler, ms),
  clearTimer: (id) => window.clearTimeout(id as number),
  isVisible: () => document.visibilityState === 'visible',
  store: createStore(safeLocalStorage()),
  requestLocation: () => requestLocation(navigator.geolocation),
  heading: createHeadingSource(browserHeadingEnvironment(window)),
  onState: (state) =>
    render(root, state, {
      onTabChange: (tab) => controller.setTab(tab),
      onRefresh: () => void controller.refresh(),
      onRequestHeading: () => void controller.requestHeading(),
      onRequestLocation: () => void controller.retryLocation(),
      onExportRecords: () => downloadJson('sunflower-records.json', controller.exportRecords()),
    }),
});

document.addEventListener('visibilitychange', () => controller.handleVisibilityChange());
void controller.start();
