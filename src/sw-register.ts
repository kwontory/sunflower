// 배포 빌드에서만 서비스 워커를 등록한다 (개발 서버에서는 캐시가 방해가 되므로 제외)
export function registerServiceWorker(): void {
  try {
    if (!import.meta.env.PROD) return;
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const register = () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
        // 등록 실패 시에도 앱은 온라인으로 정상 동작한다
      });
    };
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  } catch {
    // 등록 과정의 예외는 앱 동작에 영향을 주지 않게 한다
  }
}

registerServiceWorker();
