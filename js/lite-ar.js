(function () {
  'use strict';

  const useDraft = new URLSearchParams(location.search).get('preview') === 'draft';
  const store = window.SiamTulipSettings;
  const mediaStore = window.SiamTulipMedia;
  const settings = useDraft ? store.getDraft() : store.getPublished();

  const elements = {};
  let stream = null;
  let started = false;
  let placed = false;
  let autoPlaceTimer = null;

  function byId(id) { return document.getElementById(id); }

  function setStatus(text, found) {
    elements.status.textContent = text;
    elements.status.classList.toggle('found', Boolean(found));
  }

  function showStartError(message) {
    elements.startError.textContent = message;
    elements.startError.hidden = false;
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
    elements.flowerVideo.src = videoUrl;
    elements.flowerVideo.loop = Boolean(settings.ar.loop);
    elements.flowerVideo.load();
  }

  function applyContent() {
    document.title = settings.general.title;
    elements.title.textContent = settings.general.title;
    elements.description.textContent = settings.general.description;
    elements.hint.textContent = 'โหมดกล้องสำรอง เปิดได้ทั้ง iPhone และ Android โดยไม่ใช้มาร์กเกอร์';
    elements.startButton.textContent = settings.general.startButton || 'เริ่มเปิดกล้อง AR';
    elements.placeButton.textContent = settings.general.placeButton || 'วางดอกไม้ตรงนี้';
    elements.repositionButton.textContent = settings.general.repositionButton || 'ย้ายตำแหน่ง';
    elements.replayButton.textContent = settings.general.replayButton || 'เล่นใหม่';
    elements.guideText.textContent = 'เล็งวงกลมไปที่พื้น แล้วแตะหน้าจอเพื่อวาง';
    setStatus('รอเริ่มเปิดกล้อง…');
  }

  function applyArSettings() {
    const ar = settings.ar;
    elements.flowerPlane.setAttribute('position', `${ar.positionX} ${ar.positionY} ${ar.positionZ}`);
    elements.flowerPlane.setAttribute('rotation', `${ar.rotationX} ${ar.rotationY} ${ar.rotationZ}`);
    elements.flowerPlane.setAttribute('width', String(ar.width));
    elements.flowerPlane.setAttribute('height', String(ar.height));
    elements.flowerPlane.setAttribute('material', `shader: chromakey; src: #flowerVideo; keyColor: ${ar.keyColor}; similarity: ${ar.similarity}; smoothness: ${ar.smoothness}; spill: ${ar.spill}; transparent: true; side: double; depthWrite: false`);
    elements.flowerRoot.object3D.scale.setScalar(Number(ar.floorScale) || 1);
  }

  async function unlockFlowerVideo() {
    try {
      await elements.flowerVideo.play();
      elements.flowerVideo.pause();
      elements.flowerVideo.currentTime = 0;
    } catch (error) {
      console.warn('Unable to unlock flower video yet', error);
    }
  }

  async function requestCamera() {
    if (!window.isSecureContext) {
      throw new Error('หน้านี้ต้องเปิดผ่าน HTTPS จึงจะใช้กล้องได้');
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('เบราว์เซอร์นี้ไม่รองรับการเปิดกล้อง กรุณาใช้ Safari บน iPhone หรือ Chrome บน Android');
    }

    const preferred = {
      audio: false,
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    };

    try {
      return await navigator.mediaDevices.getUserMedia(preferred);
    } catch (firstError) {
      if (firstError?.name === 'NotAllowedError' || firstError?.name === 'SecurityError') throw firstError;
      return navigator.mediaDevices.getUserMedia({ audio: false, video: true });
    }
  }

  function pointFromScreen(clientX, clientY) {
    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);
    const nx = (clientX / width - 0.5) * 2;
    const ny = (0.5 - clientY / height) * 2;
    return {
      x: nx * 1.12,
      y: Math.max(-0.95, Math.min(0.55, ny * 1.42 - 0.12)),
      z: -2.4
    };
  }

  async function placeAt(clientX, clientY) {
    if (!started) return;
    window.clearTimeout(autoPlaceTimer);
    const point = pointFromScreen(clientX, clientY);
    elements.flowerRoot.setAttribute('position', `${point.x} ${point.y} ${point.z}`);
    elements.flowerRoot.object3D.scale.setScalar(Number(settings.ar.floorScale) || 1);
    elements.flowerRoot.setAttribute('visible', true);
    elements.floorGuide.hidden = true;
    elements.placeButton.hidden = true;
    elements.repositionButton.hidden = false;
    elements.replayButton.hidden = !settings.general.showReplayButton;
    placed = true;
    setStatus('วางดอกกระเจียวแล้ว — แตะ “ย้ายตำแหน่ง” เพื่อวางใหม่', true);
    try {
      elements.flowerVideo.currentTime = 0;
      await elements.flowerVideo.play();
    } catch (error) {
      showError(settings.status.videoError || 'วิดีโอเริ่มเล่นไม่ได้ กรุณาแตะเล่นใหม่');
    }
  }

  function resetPlacement() {
    window.clearTimeout(autoPlaceTimer);
    placed = false;
    elements.flowerRoot.setAttribute('visible', false);
    elements.repositionButton.hidden = true;
    elements.replayButton.hidden = true;
    elements.placeButton.hidden = settings.ar.autoPlace !== false;
    elements.floorGuide.hidden = false;
    elements.flowerVideo.pause();
    elements.flowerVideo.currentTime = 0;
    setStatus('เล็งไปที่พื้นแล้วแตะหน้าจอเพื่อวางดอกกระเจียว');

    if (settings.ar.autoPlace !== false) {
      autoPlaceTimer = window.setTimeout(() => {
        placeAt(window.innerWidth * 0.5, window.innerHeight * 0.66);
      }, Math.max(400, Number(settings.ar.autoPlaceDelayMs) || 900));
    }
  }

  async function startCamera() {
    elements.startError.hidden = true;
    elements.startButton.disabled = true;
    elements.startButton.textContent = 'กำลังเปิดกล้อง…';
    setStatus('กำลังขอสิทธิ์กล้อง…');

    try {
      await unlockFlowerVideo();
      stream = await requestCamera();
      elements.cameraFeed.srcObject = stream;
      await elements.cameraFeed.play();
      started = true;
      elements.startScreen.hidden = true;
      elements.floorGuide.hidden = false;
      elements.placeButton.hidden = settings.ar.autoPlace !== false;
      setStatus('เปิดกล้องแล้ว — เล็งไปที่พื้นกลางห้อง');
      resetPlacement();
    } catch (error) {
      console.error(error);
      elements.startButton.disabled = false;
      elements.startButton.textContent = 'ลองเปิดกล้องอีกครั้ง';
      const message = error?.name === 'NotAllowedError'
        ? 'ไม่ได้รับสิทธิ์กล้อง กรุณาเปิดสิทธิ์กล้องในตั้งค่าเบราว์เซอร์ แล้วลองใหม่'
        : (error?.message || settings.status.cameraError || 'เปิดกล้องไม่สำเร็จ');
      showStartError(message);
      setStatus('เปิดกล้องไม่สำเร็จ');
    }
  }

  function isInteractiveTarget(target) {
    return Boolean(target.closest('button, a, input, textarea, select, label, .card'));
  }

  function setupEvents() {
    elements.startButton.addEventListener('click', startCamera);
    elements.placeButton.addEventListener('click', () => placeAt(window.innerWidth * 0.5, window.innerHeight * 0.66));
    elements.repositionButton.addEventListener('click', resetPlacement);
    elements.replayButton.addEventListener('click', async () => {
      try {
        elements.flowerVideo.currentTime = 0;
        await elements.flowerVideo.play();
      } catch (error) {
        showError(settings.status.videoError || 'เล่นวิดีโอไม่ได้');
      }
    });

    document.addEventListener('pointerup', (event) => {
      if (!started || placed || isInteractiveTarget(event.target)) return;
      placeAt(event.clientX, event.clientY);
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) elements.flowerVideo.pause();
      else if (started && placed) elements.flowerVideo.play().catch(() => {});
    });

    window.addEventListener('pagehide', () => {
      stream?.getTracks().forEach((track) => track.stop());
    });
  }

  function showClosed() {
    elements.poster.hidden = true;
    elements.title.textContent = settings.general.closedTitle;
    elements.description.textContent = settings.general.closedDescription;
    elements.startButton.hidden = true;
    elements.hint.hidden = true;
  }

  window.addEventListener('DOMContentLoaded', async () => {
    Object.assign(elements, {
      startScreen: byId('liteStartScreen'), poster: byId('litePoster'), title: byId('liteTitle'),
      description: byId('liteDescription'), hint: byId('liteHint'), startButton: byId('startLiteButton'),
      startError: byId('liteStartError'), cameraFeed: byId('cameraFeed'), status: byId('status'),
      floorGuide: byId('floorGuide'), guideText: byId('guideText'), placeButton: byId('placeButton'),
      repositionButton: byId('repositionButton'), replayButton: byId('replayButton'), errorBox: byId('errorBox'),
      flowerVideo: byId('flowerVideo'), flowerRoot: byId('liteFlowerRoot'), flowerPlane: byId('liteFlowerPlane')
    });

    applyTheme();
    applyContent();
    applyArSettings();
    setupEvents();
    try {
      await applyMedia();
    } catch (error) {
      console.error(error);
      showStartError('โหลดสื่อ AR ไม่สำเร็จ กรุณารีเฟรชหน้าเว็บ');
    }

    if (!settings.general.enabled) showClosed();
  });
})();