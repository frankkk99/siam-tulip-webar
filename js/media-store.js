(function () {
  'use strict';

  const DB_NAME = 'siam-tulip-webar-media';
  const DB_VERSION = 1;
  const STORE = 'files';
  const activeUrls = new Map();

  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('เปิดพื้นที่เก็บไฟล์ไม่ได้'));
    });
  }

  async function transaction(mode, callback) {
    const db = await openDb();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const store = tx.objectStore(STORE);
        let result;
        try { result = callback(store); } catch (error) { reject(error); return; }
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error || new Error('บันทึกไฟล์ไม่สำเร็จ'));
        tx.onabort = () => reject(tx.error || new Error('ยกเลิกการบันทึกไฟล์'));
      });
    } finally {
      db.close();
    }
  }

  async function put(key, file) {
    if (!(file instanceof Blob)) throw new Error('ไฟล์ไม่ถูกต้อง');
    await transaction('readwrite', (store) => {
      store.put({ blob: file, name: file.name || key, type: file.type || 'application/octet-stream', size: file.size, updatedAt: new Date().toISOString() }, key);
    });
    revoke(key);
    return getMeta(key);
  }

  async function getRecord(key) {
    const db = await openDb();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly');
        const request = tx.objectStore(STORE).get(key);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error || new Error('อ่านไฟล์ไม่สำเร็จ'));
      });
    } finally {
      db.close();
    }
  }

  async function getObjectUrl(key) {
    if (activeUrls.has(key)) return activeUrls.get(key);
    const record = await getRecord(key);
    if (!record?.blob) return null;
    const url = URL.createObjectURL(record.blob);
    activeUrls.set(key, url);
    return url;
  }

  async function getMeta(key) {
    const record = await getRecord(key);
    if (!record) return null;
    return { name: record.name, type: record.type, size: record.size, updatedAt: record.updatedAt };
  }

  async function remove(key) {
    await transaction('readwrite', (store) => store.delete(key));
    revoke(key);
  }

  function revoke(key) {
    const url = activeUrls.get(key);
    if (url) URL.revokeObjectURL(url);
    activeUrls.delete(key);
  }

  async function resolve(settings, type) {
    const media = settings?.media || {};
    if (type === 'poster') {
      if (media.posterMode === 'local') return (await getObjectUrl('poster')) || media.posterUrl || 'assets/poster.jpg';
      return media.posterUrl || 'assets/poster.jpg';
    }
    if (type === 'video') {
      if (media.videoMode === 'local') return (await getObjectUrl('video')) || media.videoUrl || 'assets/siam-tulip-loop.mp4';
      return media.videoUrl || 'assets/siam-tulip-loop.mp4';
    }
    return null;
  }

  window.SiamTulipMedia = { put, getObjectUrl, getMeta, remove, resolve, revoke };
})();
