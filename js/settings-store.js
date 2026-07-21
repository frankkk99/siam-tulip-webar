(function () {
  'use strict';

  const VERSION = 3;
  const PUBLISHED_KEY = 'siam-tulip-webar:published:v1';
  const DRAFT_KEY = 'siam-tulip-webar:draft:v1';
  const PIN_KEY = 'siam-tulip-webar:admin-pin:v1';
  const DEFAULT_PIN = '2468';

  const defaults = Object.freeze({
    version: VERSION,
    updatedAt: null,
    general: {
      enabled: true,
      title: 'AR ดอกกระเจียวแดง',
      description: 'อนุญาตกล้อง แล้วหันโทรศัพท์ลงที่พื้นกลางห้อง ระบบจะวางดอกกระเจียวให้โดยอัตโนมัติ',
      startButton: 'เริ่มเปิดกล้อง AR',
      hint: 'ใช้ได้ทั้ง Safari บน iPhone และ Chrome บน Android ขยับโทรศัพท์ช้า ๆ เพื่อจับพื้น',
      closedTitle: 'นิทรรศการยังไม่เปิดให้เข้าชม',
      closedDescription: 'กรุณากลับมาใหม่อีกครั้งตามเวลาที่กำหนด',
      showReplayButton: true,
      showMarkerButton: false,
      replayButton: 'เล่นใหม่',
      markerButton: 'ดูมาร์กเกอร์',
      placeButton: 'วางดอกไม้ตรงนี้',
      repositionButton: 'ย้ายตำแหน่ง'
    },
    status: {
      preparing: 'กำลังเตรียมกล้องและระบบติดตามพื้น…',
      ready: 'ระบบพร้อมแล้ว',
      scanning: 'หันกล้องลงพื้นกลางห้อง แล้วขยับโทรศัพท์ช้า ๆ',
      found: 'จับตำแหน่งพื้นได้แล้ว — ถือกล้องให้นิ่ง',
      placed: 'วางดอกกระเจียวแล้ว — เดินดูรอบ ๆ ได้',
      lost: 'ตำแหน่งหลุด — หันกล้องกลับไปที่พื้น',
      unsupported: 'อุปกรณ์หรือเบราว์เซอร์นี้ไม่รองรับกล้องและเซนเซอร์ที่ระบบ AR ต้องใช้',
      sessionError: 'เปิดระบบติดตามพื้นไม่สำเร็จ กรุณาอนุญาตกล้องและการเคลื่อนไหว แล้วเปิดใหม่อีกครั้ง',
      videoError: 'วิดีโอเริ่มเล่นไม่ได้ กรุณาแตะปุ่ม “เล่นใหม่” อีกครั้ง',
      cameraError: 'เปิดกล้องไม่ได้ กรุณาอนุญาตสิทธิ์กล้อง แล้วรีเฟรชหน้าเว็บ'
    },
    theme: {
      primary: '#28a85f',
      background: '#06110a',
      panel: '#06190e',
      text: '#ffffff',
      mutedText: '#c7d7cc',
      statusFound: '#0c592b',
      error: '#7d1717',
      cornerRadius: 26,
      overlayOpacity: 0.9
    },
    media: {
      posterMode: 'default',
      posterUrl: 'assets/poster.jpg',
      videoMode: 'default',
      videoUrl: 'assets/siam-tulip-loop.mp4'
    },
    ar: {
      trackingMode: 'world',
      autoPlace: true,
      autoPlaceDelayMs: 900,
      floorScale: 1,
      cameraHeight: 1.6,
      maxPlacementDistance: 7,
      fallbackToMarker: false,
      markerPreset: 'hiro',
      positionX: 0,
      positionY: 0.52,
      positionZ: 0,
      rotationX: 0,
      rotationY: 0,
      rotationZ: 0,
      width: 1.62,
      height: 0.91,
      keyColor: '#047EF7',
      similarity: 0.06,
      smoothness: 0.115,
      spill: 0.85,
      loop: true,
      resetOnLost: true,
      lostDelayMs: 900,
      restartWhenFound: true,
      smoothing: true,
      smoothCount: 12,
      smoothTolerance: 0.01,
      smoothThreshold: 4
    }
  });

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function isObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value);
  }

  function mergeDeep(base, extra) {
    const output = clone(base);
    if (!isObject(extra)) return output;
    Object.keys(extra).forEach((key) => {
      if (isObject(extra[key]) && isObject(output[key])) {
        output[key] = mergeDeep(output[key], extra[key]);
      } else if (extra[key] !== undefined) {
        output[key] = extra[key];
      }
    });
    return output;
  }

  function read(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      console.warn('Unable to read settings', error);
      return null;
    }
  }

  function write(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
    return value;
  }

  function migrate(value) {
    const next = clone(value || {});
    const markerDescription = 'กดเริ่ม แล้วหันกล้องไปที่มาร์กเกอร์บนพื้น ดอกกระเจียวจะค่อย ๆ เติบโตและเล่นวนอยู่ที่ตำแหน่งเดิม';
    const floorDescription = 'กดเริ่ม แล้วหันกล้องลงที่พื้นกลางห้อง ระบบจะวางดอกกระเจียวให้โดยอัตโนมัติ';
    const markerHint = 'ใช้ Chrome บน Android หรือ Safari บน iPhone และอนุญาตสิทธิ์กล้อง';
    const floorHint = 'ขยับโทรศัพท์ช้า ๆ ซ้าย–ขวา เพื่อให้ระบบตรวจจับพื้น';
    const markerScanning = 'หันกล้องไปที่มาร์กเกอร์บนพื้น';
    const floorFound = 'จับพื้นได้แล้ว — ถือกล้องให้นิ่ง';
    const markerFound = 'พบจุด AR แล้ว — ถือกล้องให้นิ่ง';
    const oldUnsupported = 'มือถือเครื่องนี้ยังไม่รองรับการตรวจจับพื้นแบบ WebXR';
    const oldSessionError = 'เปิดโหมดตรวจจับพื้นไม่สำเร็จ กรุณาใช้ Chrome บน Android ที่รองรับ AR';

    next.general = next.general || {};
    next.status = next.status || {};
    next.ar = next.ar || {};

    if (!next.general.description || next.general.description === markerDescription || next.general.description === floorDescription) {
      next.general.description = defaults.general.description;
    }
    if (!next.general.hint || next.general.hint === markerHint || next.general.hint === floorHint) {
      next.general.hint = defaults.general.hint;
    }
    if (!next.status.scanning || next.status.scanning === markerScanning) next.status.scanning = defaults.status.scanning;
    if (!next.status.found || next.status.found === markerFound || next.status.found === floorFound) next.status.found = defaults.status.found;
    if (!next.status.unsupported || next.status.unsupported === oldUnsupported) next.status.unsupported = defaults.status.unsupported;
    if (!next.status.sessionError || next.status.sessionError === oldSessionError) next.status.sessionError = defaults.status.sessionError;
    if (!next.status.preparing || next.status.preparing === 'กำลังเตรียมระบบตรวจจับพื้น…') next.status.preparing = defaults.status.preparing;

    if (!next.ar.trackingMode || next.ar.trackingMode === 'floor') next.ar.trackingMode = 'world';
    if (!Object.prototype.hasOwnProperty.call(next.general, 'showMarkerButton')) next.general.showMarkerButton = false;
    if (!Object.prototype.hasOwnProperty.call(next.ar, 'cameraHeight')) next.ar.cameraHeight = defaults.ar.cameraHeight;
    if (!Object.prototype.hasOwnProperty.call(next.ar, 'maxPlacementDistance')) next.ar.maxPlacementDistance = defaults.ar.maxPlacementDistance;
    next.version = VERSION;
    return next;
  }

  function normalize(value) {
    return mergeDeep(defaults, migrate(value));
  }

  function getPublished() {
    return normalize(read(PUBLISHED_KEY));
  }

  function getDraft() {
    const draft = read(DRAFT_KEY);
    return normalize(draft || read(PUBLISHED_KEY));
  }

  function saveDraft(value) {
    const next = normalize(value);
    next.version = VERSION;
    return write(DRAFT_KEY, next);
  }

  function publish(value) {
    const next = normalize(value || getDraft());
    next.version = VERSION;
    next.updatedAt = new Date().toISOString();
    write(PUBLISHED_KEY, next);
    write(DRAFT_KEY, next);
    window.dispatchEvent(new CustomEvent('siam-settings-published', { detail: next }));
    return next;
  }

  function resetDraft() {
    localStorage.removeItem(DRAFT_KEY);
    return getDraft();
  }

  function resetAll() {
    localStorage.removeItem(PUBLISHED_KEY);
    localStorage.removeItem(DRAFT_KEY);
    return clone(defaults);
  }

  function getAdminPin() {
    return localStorage.getItem(PIN_KEY) || DEFAULT_PIN;
  }

  function setAdminPin(pin) {
    const clean = String(pin || '').trim();
    if (!/^\d{4,12}$/.test(clean)) {
      throw new Error('PIN ต้องเป็นตัวเลข 4–12 หลัก');
    }
    localStorage.setItem(PIN_KEY, clean);
  }

  function getPath(object, path) {
    return path.split('.').reduce((current, key) => current?.[key], object);
  }

  function setPath(object, path, value) {
    const keys = path.split('.');
    let current = object;
    keys.slice(0, -1).forEach((key) => {
      if (!isObject(current[key])) current[key] = {};
      current = current[key];
    });
    current[keys[keys.length - 1]] = value;
    return object;
  }

  window.SiamTulipSettings = {
    VERSION,
    DEFAULT_PIN,
    defaults: clone(defaults),
    clone,
    normalize,
    getPublished,
    getDraft,
    saveDraft,
    publish,
    resetDraft,
    resetAll,
    getAdminPin,
    setAdminPin,
    getPath,
    setPath
  };
})();
