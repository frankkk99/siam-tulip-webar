(function () {
  'use strict';

  if (!window.AFRAME) {
    window.addEventListener('DOMContentLoaded', () => {
      const error = document.getElementById('worldStartError');
      const fallback = document.getElementById('liteFallbackButton');
      if (error) {
        error.textContent = 'โหลดระบบแสดงผล AR ไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ต หรือเปิดโหมดกล้องสำรอง';
        error.hidden = false;
      }
      if (fallback) fallback.hidden = false;
    });
    return;
  }

  const useDraft = new URLSearchParams(location.search).get('preview') === 'draft';
  const store = window.SiamTulipSettings;
  const mediaStore = window.SiamTulipMedia;
  const settings = useDraft ? store.getDraft() : store.getPublished();

  let userStarted = false;
  let worldReady = false;
  let cameraStatus = 'idle';
  let startupTimer = null;

  if (!AFRAME.components['face-camera-y']) {
    AFRAME.registerComponent('face-camera-y', {
      init: function () {
        this.cameraPosition = new THREE.Vector3();
        this.worldPosition = new THREE.Vector3();
      },
      tick: function () {
        const camera = this.el.sceneEl && this.el.sceneEl.camera;
        if (!camera) return;
        const object = this.el.object3D;
        camera.getWorldPosition(this.cameraPosition);
        object.getWorldPosition(this.worldPosition);
        this.cameraPosition.y = this.worldPosition.y;
        object.lookAt(this.cameraPosition);
      }
    });
  }

  AFRAME.registerComponent('siam-world-placement', {
    init: function () {
      this.ready = false;
      this.placed = false;
      this.hasPoint = false;
      this.stableSince = 0;
      this.lastPoint = new THREE.Vector3();
      this.point = new THREE.Vector3();
      this.cameraPosition = new THREE.Vector3();
      this.floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      this.raycaster = new THREE.Raycaster();
      this.center = new THREE.Vector2(0, 0);
      this.reticle = null;
      this.flowerRoot = null;
      this.video = null;
      this.resolveElements();
      this.el.addEventListener('loaded', () => this.resolveElements());
      this.el.addEventListener('realityready', () => {
        this.ready = true;
        this.resolveElements();
        this.el.emit('siam-world-ready');
      });
      this.el.addEventListener('realityerror', (event) => {
        this.el.emit('siam-world-error', event.detail || {});
      });
    },

    resolveElements: function () {
      this.reticle = this.reticle || document.getElementById('reticle');
      this.flowerRoot = this.flowerRoot || document.getElementById('flowerRoot');
      this.video = this.video || document.getElementById('flowerVideo');
      return Boolean(this.reticle && this.flowerRoot && this.video);
    },

    tick: function (time) {
      if (!this.ready || !userStarted || this.placed || !this.el.camera || !this.resolveElements()) return;
      this.raycaster.setFromCamera(this.center, this.el.camera);
      const ray = this.raycaster.ray;
      const intersects = ray.direction.y < -0.035 && ray.intersectPlane(this.floorPlane, this.point);
      if (!intersects) {
        this.clearPoint();
        return;
      }

      this.el.camera.getWorldPosition(this.cameraPosition);
      const distance = this.cameraPosition.distanceTo(this.point);
      const maxDistance = Number(settings.ar.maxPlacementDistance) || 7;
      if (distance < 0.35 || distance > maxDistance) {
        this.clearPoint();
        return;
      }

      const moved = this.hasPoint ? this.point.distanceTo(this.lastPoint) : Infinity;
      this.hasPoint = true;
      this.lastPoint.copy(this.point);
      this.reticle.object3D.position.copy(this.point);
      this.reticle.object3D.position.y += 0.015;
      this.reticle.setAttribute('visible', true);
      this.el.emit('siam-floor-found', { point: this.point.clone() }, false);
      if (moved > 0.09 || !this.stableSince) this.stableSince = time;

      const delay = Math.max(250, Number(settings.ar.autoPlaceDelayMs) || 900);
      if (settings.ar.autoPlace !== false && time - this.stableSince >= delay) this.place();
    },

    clearPoint: function () {
      if (this.hasPoint) this.el.emit('siam-floor-lost');
      this.hasPoint = false;
      this.stableSince = 0;
      if (this.reticle) this.reticle.setAttribute('visible', false);
    },

    place: function () {
      if (!this.hasPoint || this.placed || !this.resolveElements()) return false;
      this.flowerRoot.object3D.position.copy(this.lastPoint);
      this.flowerRoot.object3D.scale.setScalar(Number(settings.ar.floorScale) || 1);
      this.flowerRoot.setAttribute('visible', true);
      this.reticle.setAttribute('visible', false);
      this.placed = true;
      this.el.emit('siam-flower-placed', { point: this.lastPoint.clone() }, false);
      this.video.currentTime = 0;
      this.video.play().catch(() => this.el.emit('siam-video-blocked'));
      return true;
    },

    resetPlacement: function () {
      if (!this.resolveElements()) return;
      this.placed = false;
      this.hasPoint = false;
      this.stableSince = 0;
      this.flowerRoot.setAttribute('visible', false);
      this.reticle.setAttribute('visible', false);
      this.video.pause();
      this.video.currentTime = 0;
      this.el.emit('siam-placement-reset');
    },

    recenter: function () {
      try {
        if (window.XR8 && window.XR8.XrController && window.XR8.XrController.recenter) {
          window.XR8.XrController.recenter();
        }
      } catch (error) {
        console.warn('Unable to recenter XR', error);
      }
      this.resetPlacement();
    }
  });

  function byId(id) { return document.getElementById(id); }

  function setStatus(text, found) {
    const status = byId('status');
    if (!status) return;
    status.textContent = text;
    status.classList.toggle('found', Boolean(found));
  }

  function showError(message) {
    const box = byId('errorBox');
    if (!box) return;
    box.textContent = message;
    box.hidden = false;
  }

  function showStartError(message, showFallback = true) {
    const box = byId('worldStartError');
    const fallback = byId('liteFallbackButton');
    if (box) {
      box.textContent = message;
      box.hidden = false;
    }
    if (fallback) fallback.hidden = !showFallback;
  }

  function clearStartError() {
    const box = byId('worldStartError');
    if (box) {
      box.textContent = '';
      box.hidden = true;
    }
  }

  function liteUrl() {
    const params = new URLSearchParams(location.search);
    params.delete('mode');
    const query = params.toString();
    return `lite.html${query ? `?${query}` : ''}`;
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
    const rings = byId('reticle')?.querySelectorAll('a-ring');
    if (rings && rings[1]) rings[1].setAttribute('material', 'color', settings.theme.primary);
  }

  async function applyMedia() {
    const [posterUrl, videoUrl] = await Promise.all([
      mediaStore.resolve(settings, 'poster'),
      mediaStore.resolve(settings, 'video')
    ]);
    byId('worldPoster').src = posterUrl;
    const video = byId('flowerVideo');
    video.src = videoUrl;
    video.loop = Boolean(settings.ar.loop);
    video.load();
  }

  function applyArSettings() {
    const ar = settings.ar;
    const plane = byId('flowerPlane');
    const camera = byId('camera');
    plane.setAttribute('position', `${ar.positionX} ${ar.positionY} ${ar.positionZ}`);
    plane.setAttribute('rotation', `${ar.rotationX} ${ar.rotationY} ${ar.rotationZ}`);
    plane.setAttribute('width', String(ar.width));
    plane.setAttribute('height', String(ar.height));
    plane.setAttribute('material', `shader: chromakey; src: #flowerVideo; keyColor: ${ar.keyColor}; similarity: ${ar.similarity}; smoothness: ${ar.smoothness}; spill: ${ar.spill}; transparent: true; side: double; depthWrite: false`);
    camera.setAttribute('position', `0 ${Number(ar.cameraHeight) || 1.6} 0`);
  }

  async function requestMotionPermission() {
    const request = window.DeviceOrientationEvent && window.DeviceOrientationEvent.requestPermission;
    if (typeof request !== 'function') return true;
    const result = await request.call(window.DeviceOrientationEvent);
    if (result !== 'granted') throw new Error('motion-denied');
    return true;
  }

  function enterExperience() {
    window.clearTimeout(startupTimer);
    byId('worldStartScreen').hidden = true;
    byId('floorGuide').hidden = false;
    byId('recenterButton').hidden = false;
    byId('replayButton').hidden = !settings.general.showReplayButton;
    setStatus(settings.status.scanning);
  }

  function failStartup(message) {
    window.clearTimeout(startupTimer);
    const button = byId('startWorldButton');
    button.disabled = false;
    button.textContent = 'ลองเปิดกล้องอีกครั้ง';
    showStartError(message, true);
  }

  async function unlockVideo() {
    const video = byId('flowerVideo');
    try {
      await video.play();
      video.pause();
      video.currentTime = 0;
    } catch (error) {
      console.warn('Video unlock deferred', error);
    }
  }

  function setupUi() {
    const scene = byId('arScene');
    const placement = () => scene.components['siam-world-placement'];
    const startButton = byId('startWorldButton');
    const fallbackButton = byId('liteFallbackButton');
    const placeButton = byId('placeButton');
    const repositionButton = byId('repositionButton');
    const replayButton = byId('replayButton');
    const recenterButton = byId('recenterButton');
    const floorGuide = byId('floorGuide');

    document.title = settings.general.title;
    byId('worldTitle').textContent = settings.general.title;
    byId('worldDescription').textContent = settings.general.description;
    byId('worldHint').textContent = settings.general.hint;
    byId('guideText').textContent = settings.status.scanning;
    startButton.textContent = settings.general.startButton || 'เริ่มเปิดกล้อง AR';
    placeButton.textContent = settings.general.placeButton || 'วางดอกไม้ตรงนี้';
    repositionButton.textContent = settings.general.repositionButton || 'ย้ายตำแหน่ง';
    replayButton.textContent = settings.general.replayButton || 'เล่นใหม่';
    fallbackButton.href = liteUrl();
    setStatus(settings.status.preparing);

    if (!settings.general.enabled) {
      byId('worldPoster').hidden = true;
      byId('worldTitle').textContent = settings.general.closedTitle;
      byId('worldDescription').textContent = settings.general.closedDescription;
      startButton.hidden = true;
      byId('worldHint').hidden = true;
      scene.style.display = 'none';
      return;
    }

    const onWorldReady = () => {
      worldReady = true;
      cameraStatus = 'hasVideo';
      if (userStarted) enterExperience();
      else {
        startButton.disabled = false;
        startButton.textContent = 'กล้องพร้อมแล้ว — แตะเพื่อเริ่ม';
        clearStartError();
      }
    };

    scene.addEventListener('siam-world-ready', onWorldReady);
    scene.addEventListener('realityready', onWorldReady);
    scene.addEventListener('camerastatuschange', (event) => {
      const status = event.detail && event.detail.status;
      if (!status) return;
      cameraStatus = status;
      if (status === 'requesting') setStatus('กำลังขอสิทธิ์กล้อง…');
      if (status === 'hasStream') setStatus('เปิดกล้องแล้ว กำลังเตรียมภาพ…');
      if (status === 'hasVideo') onWorldReady();
      if (status === 'failed') failStartup(settings.status.cameraError || 'เปิดกล้องไม่สำเร็จ กรุณาอนุญาตกล้องแล้วลองใหม่');
    });

    scene.addEventListener('siam-floor-found', () => {
      setStatus(settings.status.found, true);
      if (settings.ar.autoPlace === false) placeButton.hidden = false;
    });
    scene.addEventListener('siam-floor-lost', () => {
      placeButton.hidden = true;
      setStatus(settings.status.scanning);
    });
    scene.addEventListener('siam-flower-placed', () => {
      floorGuide.hidden = true;
      placeButton.hidden = true;
      repositionButton.hidden = false;
      setStatus(settings.status.placed, true);
    });
    scene.addEventListener('siam-placement-reset', () => {
      floorGuide.hidden = false;
      placeButton.hidden = true;
      repositionButton.hidden = true;
      setStatus(settings.status.scanning);
    });
    scene.addEventListener('siam-world-error', (event) => {
      console.error('8th Wall reality error', event.detail);
      failStartup(settings.status.sessionError || 'ระบบติดตามพื้นเริ่มไม่สำเร็จ กรุณาเปิดโหมดกล้องสำรอง');
    });
    scene.addEventListener('siam-video-blocked', () => showError(settings.status.videoError));

    startButton.addEventListener('click', async () => {
      clearStartError();
      userStarted = true;
      startButton.disabled = true;
      startButton.textContent = 'กำลังเปิดกล้อง…';
      setStatus('กำลังเปิดกล้องและเซนเซอร์…');
      await unlockVideo();
      try {
        await requestMotionPermission();
      } catch (error) {
        userStarted = false;
        failStartup('ไม่ได้รับสิทธิ์การเคลื่อนไหว กรุณากดอนุญาต แล้วลองอีกครั้ง หรือใช้โหมดกล้องสำรอง');
        return;
      }

      if (worldReady || cameraStatus === 'hasVideo' || (placement() && placement().ready)) {
        enterExperience();
        return;
      }

      startupTimer = window.setTimeout(() => {
        if (!worldReady) failStartup('ระบบติดตามพื้นยังไม่เปิด อาจเกิดจากอินเทอร์เน็ตหรืออุปกรณ์ กรุณาใช้โหมดกล้องสำรองเพื่อทดสอบทันที');
      }, 12000);
    });

    placeButton.addEventListener('click', () => placement()?.place());
    repositionButton.addEventListener('click', () => placement()?.resetPlacement());
    recenterButton.addEventListener('click', () => placement()?.recenter());
    replayButton.addEventListener('click', () => {
      const video = byId('flowerVideo');
      video.currentTime = 0;
      video.play().catch(() => showError(settings.status.videoError));
    });

    window.setTimeout(() => {
      if (!window.XR8 && !worldReady) {
        failStartup('โหลดเอนจินตรวจจับพื้นไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ต หรือเปิดโหมดกล้องสำรอง');
      }
    }, 10000);
  }

  window.addEventListener('DOMContentLoaded', () => {
    applyTheme();
    applyArSettings();
    setupUi();
    applyMedia().catch((error) => {
      console.error(error);
      showStartError('โหลดวิดีโอ AR ไม่สำเร็จ กรุณารีเฟรชหน้าเว็บ', false);
    });
  });
})();