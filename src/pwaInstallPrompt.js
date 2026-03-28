window.deferredPWAInstallPrompt = null;

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  window.deferredPWAInstallPrompt = event;
});
