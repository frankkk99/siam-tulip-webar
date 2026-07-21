(function () {
  'use strict';

  if (!window.AFRAME) return;

  const useDraft = new URLSearchParams(location.search).get('preview') === 'draft';
  const store = window.SiamTulipSettings;
  const mediaStore = window.SiamTulipMedia;
  const settings = useDraft ? store.getDraft() : store.getPublished();

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
      if (!this.ready || this.placed || !this.el.camera || !this.resolveElements()) return;

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
      if (settings.ar.autoPlace !== false && time - this.stableSince >= delay) {
        this.place();
      }
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

  function byId(id) {
    return document.getElementById(id);
  }

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

  function markerFallback(reason) {
    if (!settings.ar.fallbackToMarker) return false;
    const params = new URLSearchParams(location.search);
    params.set('fallback', reason || 'world-tracking-error');
    location.replace(`marker-ar.html?${params.toString()}`);
    return true;
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
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) themeMeta.setAttribute('content', settings.theme.background);
    const rings = byId('reticle') && byId('reticle').querySelectorAll('a-ring');
    if (rings && rings[1]) rings[1].setAttribute('material', 'color', settings.theme.primary);
  }

  async function applyMedia() {
    const video = byId('flowerVideo');
    const videoUrl = await mediaStore.resolve(settings, 'video');
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

  function setupUi() {
    const scene = byId('arScene');
    const placement = () => scene.components['siam-world-placement'];
    const placeButton = byId('placeButton');
    const repositionButton = byId('repositionButton');
    const replayButton = byId('replayButton');
    const recenterButton = byId('recenterButton');
    const floorGuide = byId('floorGuide');

    document.title = settings.general.title;
    byId('guideText').textContent = settings.status.scanning;
    placeButton.textContent = settings.general.placeButton || 'วางดอกไม้ตรงนี้';
    repositionButton.textContent = settings.general.repositionButton || 'ย้ายตำแหน่ง';
    replayButton.textContent = settings.general.replayButton || 'เล่นใหม่';
    replayButton.hidden = !settings.general.showReplayButton;
    setStatus(settings.status.preparing);

    if (!settings.general.enabled) {
      floorGuide.hidden = true;
      document.querySelector('.controls').hidden = true;
      setStatus(settings.general.closedTitle);
      showError(settings.general.closedDescription);
      return;
    }

    let worldReady = false;
    const readyTimeout = window.setTimeout(() => {
      if (!worldReady && !markerFallback('world-load-timeout')) {
        showError('ระบบติดตามพื้นโหลดนานเกินไป กรุณาตรวจสอบอินเทอร์เน็ต แล้วรีเฟรชหน้าเว็บ');
      }
    }, 20000);

    const onWorldReady = () => {
      worldReady = true;
      window.clearTimeout(readyTimeout);
      floorGuide.hidden = false;
      setStatus(settings.status.scanning);
    };

    scene.addEventListener('siam-world-ready', onWorldReady);
    if (placement() && placement().ready) onWorldReady();

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
      window.clearTimeout(readyTimeout);
      if (!markerFallback('world-tracking-error')) {
        showError(settings.status.sessionError || 'เปิดระบบติดตามพื้นไม่สำเร็จ กรุณาอนุญาตกล้องและการเคลื่อนไหว');
      }
    });

    scene.addEventListener('siam-video-blocked', () => {
      showError(settings.status.videoError);
    });

    placeButton.addEventListener('click', () => {
      const component = placement();
      if (component) component.place();
    });
    repositionButton.addEventListener('click', () => {
      const component = placement();
      if (component) component.resetPlacement();
    });
    recenterButton.addEventListener('click', () => {
      const component = placement();
      if (component) component.recenter();
    });
    replayButton.addEventListener('click', () => {
      const video = byId('flowerVideo');
      video.currentTime = 0;
      video.play().catch(() => showError(settings.status.videoError));
    });
  }

  window.addEventListener('DOMContentLoaded', () => {
    applyTheme();
    applyArSettings();
    setupUi();
    applyMedia().catch((error) => {
      console.error(error);
      showError('โหลดวิดีโอ AR ไม่สำเร็จ');
    });
  });
})();
