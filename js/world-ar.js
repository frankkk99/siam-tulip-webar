(function () {
  'use strict';

  if (!window.AFRAME) return;

  const useDraft = new URLSearchParams(location.search).get('preview') === 'draft';
  const store = window.SiamTulipSettings;
  const mediaStore = window.SiamTulipMedia;
  const settings = useDraft ? store.getDraft() : store.getPublished();

  AFRAME.registerComponent('face-camera-y', {
    tick: function () {
      const camera = this.el.sceneEl?.camera;
      if (!camera) return;
      const object = this.el.object3D;
      const cameraPosition = new THREE.Vector3();
      const worldPosition = new THREE.Vector3();
      camera.getWorldPosition(cameraPosition);
      object.getWorldPosition(worldPosition);
      cameraPosition.y = worldPosition.y;
      object.lookAt(cameraPosition);
    }
  });

  AFRAME.registerComponent('siam-world-placement', {
    init: function () {
      this.ready = false;
      this.placed = false;
      this.hasPoint = false;
      this.stableSince = 0;
      this.lastPoint = new THREE.Vector3();
      this.point = new THREE.Vector3();
      this.floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      this.raycaster = new THREE.Raycaster();
      this.center = new THREE.Vector2(0, 0);
      this.reticle = document.getElementById('reticle');
      this.flowerRoot = document.getElementById('flowerRoot');
      this.video = document.getElementById('flowerVideo');

      this.el.addEventListener('realityready', () => {
        this.ready = true;
        this.el.emit('siam-world-ready');
      });

      this.el.addEventListener('realityerror', (event) => {
        this.el.emit('siam-world-error', event.detail || {});
      });
    },

    tick: function (time) {
      if (!this.ready || this.placed || !this.el.camera) return;

      this.raycaster.setFromCamera(this.center, this.el.camera);
      const ray = this.raycaster.ray;
      const intersects = ray.direction.y < -0.035 && ray.intersectPlane(this.floorPlane, this.point);

      if (!intersects) {
        this.clearPoint();
        return;
      }

      const cameraPosition = new THREE.Vector3();
      this.el.camera.getWorldPosition(cameraPosition);
      const distance = cameraPosition.distanceTo(this.point);
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

      if (moved > 0.09) this.stableSince = time;
      if (!this.stableSince) this.stableSince = time;

      if (settings.ar.autoPlace !== false && time - this.stableSince >= Math.max(250, Number(settings.ar.autoPlaceDelayMs) || 900)) {
        this.place();
      }
    },

    clearPoint: function () {
      if (this.hasPoint) this.el.emit('siam-floor-lost');
      this.hasPoint = false;
      this.stableSince = 0;
      this.reticle?.setAttribute('visible', false);
    },

    place: function () {
      if (!this.hasPoint || this.placed) return false;
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
        if (window.XR8?.XrController?.recenter) window.XR8.XrController.recenter();
      } catch (error) {
        console.warn('Unable to recenter XR', error);
      }
      this.resetPlacement();
    }
  });

  function byId(id) { return document.getElementById(id); }

  function setStatus(text, found = false) {
    const status = byId('status');
    status.textContent = text;
    status.classList.toggle('found', found);
  }

  function showError(message) {
    const box = byId('errorBox');
    box.textContent = message;
    box.hidden = false;
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
    byId('reticle')?.querySelectorAll('a-ring')[1]?.setAttribute('material', 'color', settings.theme.primary);
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

    scene.addEventListener('siam-world-ready', () => {
      floorGuide.hidden = false;
      setStatus(settings.status.scanning);
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
      showError(settings.status.sessionError || 'เปิดระบบติดตามพื้นไม่สำเร็จ กรุณาอนุญาตกล้องและการเคลื่อนไหว');
    });

    scene.addEventListener('siam-video-blocked', () => {
      showError(settings.status.videoError);
    });

    placeButton.addEventListener('click', () => placement()?.place());
    repositionButton.addEventListener('click', () => placement()?.resetPlacement());
    recenterButton.addEventListener('click', () => placement()?.recenter());
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
