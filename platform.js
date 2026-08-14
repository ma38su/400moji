export function setupPlatformFeatures({ fullscreenButton, installButton, showToast, enableServiceWorker = true }) {
  let installPrompt;
  const fullscreenElement = () => document.fullscreenElement || document.webkitFullscreenElement;
  const updateFullscreenButton = () => {
    const active = Boolean(fullscreenElement());
    fullscreenButton.textContent = active ? "全画面を終了" : "全画面";
    fullscreenButton.setAttribute("aria-pressed", String(active));
  };

  fullscreenButton.addEventListener("click", async () => {
    try {
      if (fullscreenElement()) {
        const exit = document.exitFullscreen || document.webkitExitFullscreen;
        await exit.call(document);
      } else {
        const request = document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen;
        if (!request) {
          showToast("Safariの共有メニューからホーム画面に追加すると全画面で使えます");
          return;
        }
        await request.call(document.documentElement);
      }
    } catch {
      showToast("全画面表示に切り替えられませんでした");
    }
  });
  document.addEventListener("fullscreenchange", updateFullscreenButton);
  document.addEventListener("webkitfullscreenchange", updateFullscreenButton);

  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    installPrompt = event;
    installButton.hidden = false;
  });
  installButton.addEventListener("click", async () => {
    if (!installPrompt) return;
    installButton.hidden = true;
    await installPrompt.prompt();
    installPrompt = null;
  });
  window.addEventListener("appinstalled", () => {
    installPrompt = null;
    installButton.hidden = true;
    showToast("原稿用紙アプリ - 400mojiをインストールしました");
  });

  if (enableServiceWorker && "serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {
        console.warn("オフライン機能を有効にできませんでした");
      });
    });
  } else if ("serviceWorker" in navigator) {
    window.addEventListener("load", async () => {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map(registration => registration.unregister()));
    });
  }
}
