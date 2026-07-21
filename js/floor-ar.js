(function () {
  'use strict';

  if (!window.AFRAME) return;

  AFRAME.registerComponent('face-camera-y', {
    tick: function () {
      const scene = this.el.sceneEl;
      if (!scene?.camera) return;
      const object = this.el.object3D;
      const cameraPosition = new THREE.Vector3();
      scene.camera.getWorldPosition(cameraPosition);
      const worldPosition = new THREE.Vector3();
      object.getWorldPosition(worldPosition);
      cameraPosition.y = worldPosition.y;
      object.lookAt(cameraPosition);
    }
  });

  AFRAME.registerComponent('floor-hit-test', {
    init: function () {
      this.hitTestSource = null;
      this.viewerSpace = null;
      this.referenceSpace = null;
      this.lastMatrix = new THREE.Matrix4();
      this.hasHit = false;
      this.session = null;

      this.el.addEventListener('enter-vr', () => this.setupSession());
      this.el.addEventListener('exit-vr', () => this.cleanup());
    },

    async setupSession() {
      if (!this.el.is('ar-mode')) return;
      const renderer = this.el.renderer;
      const session = renderer?.xr?.getSession?.();
      if (!session || typeof session.requestHitTestSource !== 'function') {
        this.el.emit('floor-hit-error', { reason: 'hit-test-unavailable' });
        return;
      }

      this.cleanup();
      this.session = session;

      try {
        this.viewerSpace = await session.requestReferenceSpace('viewer');
        this.referenceSpace = renderer.xr.getReferenceSpace();
        this.hitTestSource = await session.requestHitTestSource({ space: this.viewerSpace });
        session.addEventListener('end', () => this.cleanup(), { once: true });
        this.el.emit('floor-hit-ready');
      } catch (error) {
        console.error('Unable to start floor hit test', error);
        this.el.emit('floor-hit-error', { reason: error?.name || 'setup-failed', error });
      }
    },

    tick: function () {
      if (!this.hitTestSource || !this.referenceSpace) return;
      const frame = this.el.renderer?.xr?.getFrame?.();
      if (!frame) return;

      let results;
      try {
        results = frame.getHitTestResults(this.hitTestSource);
      } catch (error) {
        return;
      }
      if (!results.length) {
        if (this.hasHit) {
          this.hasHit = false;
          this.el.emit('floor-hit-lost');
        }
        return;
      }

      const pose = results[0].getPose(this.referenceSpace);
      if (!pose) return;
      this.lastMatrix.fromArray(pose.transform.matrix);
      this.hasHit = true;
      this.el.emit('floor-hit-found', { matrix: this.lastMatrix.clone() }, false);
    },

    cleanup: function () {
      try { this.hitTestSource?.cancel?.(); } catch (error) { console.warn(error); }
      this.hitTestSource = null;
      this.viewerSpace = null;
      this.referenceSpace = null;
      this.session = null;
      this.hasHit = false;
    }
  });

  const useDraft = new URLSearchParams(location.search).get('preview') === 'draft';
  const store = window.SiamTulipSettings;
  const mediaStore = window.SiamTulipMedia;
  const settings = useDraft ? store.getDraft() : store.getPublished();
  const elements = {};
  let started = false;
  let placed = false;
  let currentHitMatrix = null;
  let autoPlaceTimer = null;

  function byId(id) { return document.getElementById(id); }

  function setStatus(text, found = false) {
    elements.status.textContent = text;
    elements.status.classList.toggle('found', found);
  }

  function setStartError(message = '') {
    if (!elements.startError) return;
    elements.startError.textContent = message;
    elements.startError.hidden = !message;
  }

  function showError(message, { onStartScreen = false } = {}) {
    elements.errorBox.textContent = message;
    elements.errorBox.hidden = false;
    if (onStartScreen || !elements.startScreen.hidden) setStartError(message);
  }

  function setStarting(isStarting) {
    elements.startButton.disabled = isStarting;
    elements.startButton.setAttribute('aria-busy', String(isStarting));
    elements.startButton.textContent = isStarting
      ? (settings.general.startingButton || 'กำลังตรวจสอบอุปกรณ์…')
      : settings.general.startButton;
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
    elements.reticle?.querySelectorAll('a-ring')[1]?.setAttribute('material', 'color', settings.theme.primary);
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
    elements.replayButton.hidden = !settings.general.showReplayButton;
    elements.placeButton.textContent = settings.general.placeButton || 'วางดอกไม้ตรงนี้';
    elements.repositionButton.textContent = settings.general.repositionButton || 'ย้ายตำแหน่ง';
    setStatus(settings.status.preparing);
  }

  function applyArSettings() {
    const ar = settings.ar;
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
      showError(settings.status.videoError, { onStartScreen: !started });
      console.error(error);
    }
  }

  function isInAppBrowser() {
    return /Line\/|FBAN|FBAV|Instagram|Messenger/i.test(navigator.userAgent || '');
  }

  function isIOS() {
    const ua = navigator.userAgent || '';
    return /iPad|iPhone|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  async function getSupportProblem() {
    if (!window.isSecureContext) {
      return 'หน้านี้ต้องเปิดผ่าน HTTPS จึงจะใช้กล้องและตรวจจับพื้นได้';
    }
    if (isInAppBrowser()) {
      return 'เบราว์เซอร์ในแอปยังเปิด Surface AR ไม่ได้ กรุณาเปิดลิงก์นี้ด้วย Chrome บน Android';
    }
    if (!navigator.xr) {
      if (isIOS()) {
        return 'iPhone และ Safari ยังไม่รองรับการตรวจจับพื้น WebXR แบบนี้ กรุณาทดลองด้วย Android ที่รองรับ ARCore';
      }
      return 'เบราว์เซอร์นี้ไม่มี WebXR กรุณาใช้ Chrome บน Android ที่รองรับ ARCore';
    }
    if (typeof navigator.xr.isSessionSupported !== 'function') {
      return 'เบราว์เซอร์นี้ตรวจสอบ Surface AR ไม่ได้ กรุณาอัปเดต Chrome และ Google Play Services for AR';
    }
    try {
      const supported = await navigator.xr.isSessionSupported('immersive-ar');
      return supported ? '' : 'มือถือเครื่องนี้ไม่รองรับ Surface AR หรือยังไม่มี Google Play Services for AR';
    } catch (error) {
      console.error('Unable to check immersive-ar support', error);
      return 'ตรวจสอบความสามารถ AR ไม่สำเร็จ กรุณาเปิดใหม่ด้วย Chrome บน Android';
    }
  }

  function cancelAutoPlace() {
    clearTimeout(autoPlaceTimer);
    autoPlaceTimer = null;
  }

  function placeFlower() {
    if (!currentHitMatrix || placed) return;
    const position = new THREE.Vector3().setFromMatrixPosition(currentHitMatrix);
    elements.flowerRoot.object3D.position.copy(position);
    elements.flowerRoot.object3D.quaternion.identity();
    elements.flowerRoot.object3D.scale.setScalar(Number(settings.ar.floorScale) || 1);
    elements.flowerRoot.setAttribute('visible', true);
    elements.reticle.setAttribute('visible', false);
    elements.floorGuide.hidden = true;
    elements.placeButton.hidden = true;
    elements.repositionButton.hidden = false;
    placed = true;
    setStatus(settings.status.placed || 'วางดอกกระเจียวแล้ว — เดินดูรอบ ๆ ได้', true);
    safePlay({ restart: true });
  }

  function resetPlacement() {
    placed = false;
    currentHitMatrix = null;
    cancelAutoPlace();
    elements.flowerRoot.setAttribute('visible', false);
    elements.reticle.setAttribute('visible', false);
    elements.repositionButton.hidden = true;
    elements.floorGuide.hidden = false;
    elements.video.pause();
    elements.video.currentTime = 0;
    setStatus(settings.status.scanning);
  }

  function handleHit(event) {
    if (!started || placed) return;
    currentHitMatrix = event.detail.matrix;
    const position = new THREE.Vector3().setFromMatrixPosition(currentHitMatrix);
    const quaternion = new THREE.Quaternion().setFromRotationMatrix(currentHitMatrix);
    elements.reticle.object3D.position.copy(position);
    elements.reticle.object3D.quaternion.copy(quaternion);
    elements.reticle.setAttribute('visible', true);
    setStatus(settings.status.found, true);

    if (settings.ar.autoPlace !== false) {
      if (!autoPlaceTimer) {
        autoPlaceTimer = setTimeout(placeFlower, Math.max(250, Number(settings.ar.autoPlaceDelayMs) || 800));
      }
    } else {
      elements.placeButton.hidden = false;
    }
  }

  function handleHitLost() {
    if (placed) return;
    currentHitMatrix = null;
    cancelAutoPlace();
    elements.reticle.setAttribute('visible', false);
    elements.placeButton.hidden = true;
    setStatus(settings.status.scanning);
  }

  async function enterImmersiveAr() {
    try {
      return await elements.scene.enterAR();
    } catch (error) {
      const message = String(error?.message || error);
      if (/not supported/i.test(message) && typeof elements.scene.enterVR === 'function') {
        return elements.scene.enterVR(true);
      }
      throw error;
    }
  }

  async function startAr() {
    setStartError('');
    elements.errorBox.hidden = true;
    setStarting(true);

    const problem = await getSupportProblem();
    if (problem) {
      if (settings.ar.fallbackToMarker) {
        const params = new URLSearchParams(location.search);
        params.set('fallback', 'floor-unsupported');
        location.replace(`marker-ar.html?${params}`);
        return;
      }
      showError(problem, { onStartScreen: true });
      setStarting(false);
      return;
    }

    if (!elements.scene.hasLoaded) {
      try {
        await Promise.race([
          new Promise((resolve) => elements.scene.addEventListener('loaded', resolve, { once: true })),
          new Promise((_, reject) => setTimeout(() => reject(new Error('scene-load-timeout')), 8000))
        ]);
      } catch (error) {
        showError('ระบบ AR โหลดไม่สำเร็จ กรุณารีเฟรชหน้าเว็บแล้วลองใหม่', { onStartScreen: true });
        setStarting(false);
        return;
      }
    }

    started = true;
    await safePlay({ restart: true });
    elements.video.pause();

    try {
      await enterImmersiveAr();
      elements.startScreen.hidden = true;
      elements.floorGuide.hidden = false;
      setStatus(settings.status.scanning);
    } catch (error) {
      started = false;
      console.error(error);
      const detail = String(error?.cause?.message || error?.message || '');
      const message = detail.includes('NotAllowedError')
        ? 'เบราว์เซอร์ไม่อนุญาตให้เปิด AR กรุณาอนุญาตกล้องแล้วลองใหม่'
        : (settings.status.sessionError || 'เปิดโหมดตรวจจับพื้นไม่สำเร็จ กรุณาใช้ Chrome บน Android ที่รองรับ AR');
      showError(message, { onStartScreen: true });
      setStarting(false);
    }
  }

  async function initialize() {
    Object.assign(elements, {
      startScreen: byId('startScreen'), startError: byId('startError'), poster: byId('poster'), title: byId('title'),
      description: byId('description'), startButton: byId('startButton'), hint: byId('hint'),
      ui: byId('ui'), status: byId('status'), placeButton: byId('placeButton'),
      repositionButton: byId('repositionButton'), replayButton: byId('replayButton'),
      floorGuide: byId('floorGuide'), errorBox: byId('errorBox'), scene: byId('arScene'),
      reticle: byId('reticle'), flowerRoot: byId('flowerRoot'), plane: byId('flowerPlane'),
      video: byId('flowerVideo')
    });

    applyTheme();
    applyContent();
    applyArSettings();
    await applyMedia();

    if (!settings.general.enabled) {
      showClosedScreen();
      return;
    }

    elements.startButton.addEventListener('click', startAr);
    elements.placeButton.addEventListener('click', placeFlower);
    elements.repositionButton.addEventListener('click', resetPlacement);
    elements.replayButton.addEventListener('click', () => {
      if (started && placed) safePlay({ restart: true });
    });

    elements.scene.addEventListener('floor-hit-ready', () => {
      if (started && !placed) setStatus(settings.status.scanning);
    });
    elements.scene.addEventListener('floor-hit-found', handleHit);
    elements.scene.addEventListener('floor-hit-lost', handleHitLost);
    elements.scene.addEventListener('floor-hit-error', () => {
      showError(settings.status.sessionError || 'ระบบตรวจจับพื้นเริ่มทำงานไม่สำเร็จ');
    });
    elements.scene.addEventListener('exit-vr', () => {
      started = false;
      cancelAutoPlace();
      elements.video.pause();
      resetPlacement();
      elements.floorGuide.hidden = true;
      elements.startScreen.hidden = false;
      setStarting(false);
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) elements.video.pause();
      else if (started && placed) safePlay();
    });
  }

  window.addEventListener('DOMContentLoaded', () => {
    initialize().catch((error) => {
      console.error(error);
      const box = byId('startError') || byId('errorBox');
      if (box) {
        box.textContent = 'ระบบเริ่มทำงานไม่สำเร็จ กรุณารีเฟรชหน้าเว็บ';
        box.hidden = false;
      }
    });
  });
})();
