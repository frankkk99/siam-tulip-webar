(function () {
  'use strict';

  const useDraft = new URLSearchParams(location.search).get('preview') === 'draft';
  const store = window.SiamTulipSettings;
  const mediaStore = window.SiamTulipMedia;
  const settings = useDraft ? store.getDraft() : store.getPublished();

  const elements = {};
  let started = false;
  let markerVisible = false;
  let resetTimer = null;

  function byId(id) { return document.getElementById(id); }

  function setStatus(text, found = false) {
    elements.status.textContent = text;
    elements.status.classList.toggle('found', found);
  }

  function showError(message) {
    elements.errorBox.textContent = message;
    elements.errorBox.hidden = false;
  }

  function applyTheme() {
    const root = document.documentElement;
    root.style.setProperty('--primary', settings.theme.primary);
    root.style.setProperty('--background', settings.theme.background);
    root.style.setProperty('--panel', settings.theme.panel);
    root.style.setProperty('--text', settings.theme.text);
    root.style.setProperty('--muted', settings.theme.mutedText);
    root.style.setProperty('--status-found', settings.theme.statusFound);
    root.style.setProperty('--error', settings.theme.error);
    root.style.setProperty('--radius', `${settings.theme.cornerRadius}px`);
    root.style.setProperty('--panel-mix', `${Math.round(Number(settings.theme.overlayOpacity) * 100)}%`);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', settings.theme.background);
  }

  async function applyMedia() {
    const [posterUrl, videoUrl] = await Promise.all([
      mediaStore.resolve(settings, 'poster'),
      mediaStore.resolve(settings, 'video')
    ]);
    elements.poster.src = posterUrl;
    elements.video.src = videoUrl;
    elements.video.loop = Boolean(settings.ar.loop);
    elements.video.load();
  }

  function applyContent() {
    document.title = settings.general.title;
    elements.title.textContent = settings.general.title;
    elements.description.textContent = settings.general.description;
    elements.startButton.textContent = settings.general.startButton;
    elements.hint.textContent = settings.general.hint;
    elements.replayButton.textContent = settings.general.replayButton;
    elements.markerButton.textContent = settings.general.markerButton;
    elements.replayButton.hidden = !settings.general.showReplayButton;
    elements.markerButton.hidden = !settings.general.showMarkerButton;
    setStatus(settings.status.preparing);
  }

  function applyArSettings() {
    const ar = settings.ar;
    elements.marker.setAttribute('preset', ar.markerPreset || 'hiro');
    elements.marker.setAttribute('smooth', String(Boolean(ar.smoothing)));
    elements.marker.setAttribute('smooth-count', String(ar.smoothCount));
    elements.marker.setAttribute('smooth-tolerance', String(ar.smoothTolerance));
    elements.marker.setAttribute('smooth-threshold', String(ar.smoothThreshold));
    elements.plane.setAttribute('position', `${ar.positionX} ${ar.positionY} ${ar.positionZ}`);
    elements.plane.setAttribute('rotation', `${ar.rotationX} ${ar.rotationY} ${ar.rotationZ}`);
    elements.plane.setAttribute('width', String(ar.width));
    elements.plane.setAttribute('height', String(ar.height));
    elements.plane.setAttribute('material', `shader: chromakey; src: #flowerVideo; keyColor: ${ar.keyColor}; similarity: ${ar.similarity}; smoothness: ${ar.smoothness}; spill: ${ar.spill}; transparent: true; side: double; depthWrite: false`);
  }

  function showClosedScreen() {
    elements.startScreen.classList.add('closed');
    elements.poster.hidden = true;
    elements.title.textContent = settings.general.closedTitle;
    elements.description.textContent = settings.general.closedDescription;
    elements.startButton.hidden = true;
    elements.hint.hidden = true;
    elements.scene.style.display = 'none';
    elements.ui.style.display = 'none';
  }

  async function safePlay({ restart = false } = {}) {
    try {
      if (restart) elements.video.currentTime = 0;
      await elements.video.play();
    } catch (error) {
      showError(settings.status.videoError);
      console.error(error);
    }
  }

  async function initialize() {
    Object.assign(elements, {
      startScreen: byId('startScreen'), poster: byId('poster'), title: byId('title'),
      description: byId('description'), startButton: byId('startButton'), hint: byId('hint'),
      ui: byId('ui'), status: byId('status'), replayButton: byId('replayButton'),
      markerButton: byId('markerButton'), errorBox: byId('errorBox'), scene: byId('arScene'),
      marker: byId('flowerMarker'), plane: byId('flowerPlane'), video: byId('flowerVideo')
    });

    applyTheme();
    applyContent();
    applyArSettings();
    await applyMedia();

    if (!settings.general.enabled) {
      showClosedScreen();
      return;
    }

    elements.startButton.addEventListener('click', async () => {
      started = true;
      elements.errorBox.hidden = true;
      await safePlay({ restart: true });
      elements.video.pause();
      elements.startScreen.hidden = true;
      setStatus(settings.status.scanning);
    });

    elements.replayButton.addEventListener('click', () => {
      if (started) safePlay({ restart: true });
    });

    elements.marker.addEventListener('markerFound', () => {
      markerVisible = true;
      clearTimeout(resetTimer);
      setStatus(settings.status.found, true);
      if (started) {
        const shouldRestart = settings.ar.restartWhenFound && (elements.video.paused || elements.video.currentTime < 0.2);
        safePlay({ restart: shouldRestart });
      }
    });

    elements.marker.addEventListener('markerLost', () => {
      markerVisible = false;
      setStatus(settings.status.lost);
      clearTimeout(resetTimer);
      if (!settings.ar.resetOnLost) return;
      resetTimer = setTimeout(() => {
        if (!markerVisible) {
          elements.video.pause();
          elements.video.currentTime = 0;
        }
      }, Math.max(0, Number(settings.ar.lostDelayMs) || 0));
    });

    window.addEventListener('arjs-video-loaded', () => {
      if (!started) setStatus(settings.status.ready);
    });

    window.addEventListener('error', (event) => {
      const text = String(event.message || '').toLowerCase();
      if (text.includes('camera') || text.includes('permission')) showError(settings.status.cameraError);
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) elements.video.pause();
      else if (started && markerVisible) safePlay();
    });
  }

  window.addEventListener('DOMContentLoaded', () => {
    initialize().catch((error) => {
      console.error(error);
      const box = byId('errorBox');
      if (box) {
        box.textContent = 'ระบบเริ่มทำงานไม่สำเร็จ กรุณารีเฟรชหน้าเว็บ';
        box.hidden = false;
      }
    });
  });
})();
