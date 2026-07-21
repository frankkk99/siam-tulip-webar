(function () {
  'use strict';

  const SESSION_KEY = 'siam-tulip-webar:admin-session';
  const store = window.SiamTulipSettings;
  const media = window.SiamTulipMedia;
  let draft = store.getDraft();
  let saveTimer = null;
  let toastTimer = null;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes)) return '';
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = bytes;
    let index = 0;
    while (value >= 1024 && index < units.length - 1) {
      value /= 1024;
      index += 1;
    }
    return `${value.toFixed(index ? 1 : 0)} ${units[index]}`;
  }

  function showToast(message, isError = false) {
    const toast = $('#toast');
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.toggle('error', isError);
    toast.hidden = false;
    toastTimer = setTimeout(() => { toast.hidden = true; }, 3200);
  }

  function setSaveStatus(text) { $('#saveStatus').textContent = text; }

  function parseInputValue(input) {
    if (input.type === 'checkbox') return input.checked;
    if (input.type === 'number' || input.type === 'range') {
      const value = Number(input.value);
      return Number.isFinite(value) ? value : 0;
    }
    return input.value;
  }

  function fillInput(input, value) {
    if (input.type === 'checkbox') input.checked = Boolean(value);
    else input.value = value ?? '';
  }

  function renderForm() {
    $$('[data-setting]').forEach((input) => {
      fillInput(input, store.getPath(draft, input.dataset.setting));
    });
    updatePreview();
    updateMediaMeta();
  }

  async function updatePreview() {
    const root = $('#previewPhone');
    root.style.setProperty('--preview-bg', draft.theme.background);
    root.style.setProperty('--preview-primary', draft.theme.primary);
    root.style.setProperty('--preview-radius', `${draft.theme.cornerRadius}px`);
    $('#previewCard').style.background = draft.theme.panel;
    $('#previewCard').style.opacity = draft.theme.overlayOpacity;
    $('#previewTitle').textContent = draft.general.enabled ? draft.general.title : draft.general.closedTitle;
    $('#previewDescription').textContent = draft.general.enabled ? draft.general.description : draft.general.closedDescription;
    $('#previewStartButton').textContent = draft.general.startButton;
    $('#previewStartButton').hidden = !draft.general.enabled;
    $('#previewHint').textContent = draft.general.hint;
    $('#previewHint').hidden = !draft.general.enabled;
    try {
      $('#previewPoster').src = await media.resolve(draft, 'poster');
      $('#previewPoster').hidden = !draft.general.enabled;
    } catch (error) {
      console.warn(error);
    }
  }

  function queueSave() {
    setSaveStatus('กำลังบันทึก Draft…');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      store.saveDraft(draft);
      setSaveStatus('บันทึก Draft แล้ว · ยังไม่เผยแพร่');
    }, 250);
  }

  function syncDuplicateInputs(path, source) {
    $$(`[data-setting="${CSS.escape(path)}"]`).forEach((input) => {
      if (input !== source) fillInput(input, store.getPath(draft, path));
    });
  }

  async function updateMediaMeta() {
    for (const type of ['poster', 'video']) {
      const meta = await media.getMeta(type);
      const target = $(`#${type}Meta`);
      target.textContent = meta ? `${meta.name} · ${formatBytes(meta.size)}` : 'ยังไม่มีไฟล์ในเครื่อง';
    }
  }

  async function handleUpload(type, file) {
    if (!file) return;
    if (type === 'video' && file.size > 120 * 1024 * 1024) throw new Error('วิดีโอต้องมีขนาดไม่เกิน 120 MB');
    if (type === 'poster' && file.size > 12 * 1024 * 1024) throw new Error('รูปต้องมีขนาดไม่เกิน 12 MB');
    await media.put(type, file);
    store.setPath(draft, `media.${type}Mode`, 'local');
    store.saveDraft(draft);
    renderForm();
    showToast(`อัปโหลด${type === 'video' ? 'วิดีโอ' : 'รูป'}ลงเครื่องนี้แล้ว`);
  }

  function downloadJson() {
    const data = JSON.stringify(draft, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `siam-tulip-webar-settings-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function setupLogin() {
    const loginScreen = $('#loginScreen');
    const shell = $('#adminShell');

    function unlock() {
      loginScreen.hidden = true;
      shell.hidden = false;
      renderForm();
    }

    if (sessionStorage.getItem(SESSION_KEY) === '1') unlock();

    $('#loginForm').addEventListener('submit', (event) => {
      event.preventDefault();
      const pin = $('#pinInput').value.trim();
      if (pin !== store.getAdminPin()) {
        showToast('PIN ไม่ถูกต้อง', true);
        return;
      }
      sessionStorage.setItem(SESSION_KEY, '1');
      $('#pinInput').value = '';
      unlock();
    });

    $('#logoutButton').addEventListener('click', () => {
      sessionStorage.removeItem(SESSION_KEY);
      location.reload();
    });
  }

  function setupEditor() {
    document.addEventListener('input', (event) => {
      const input = event.target.closest('[data-setting]');
      if (!input) return;
      const path = input.dataset.setting;
      store.setPath(draft, path, parseInputValue(input));
      syncDuplicateInputs(path, input);
      queueSave();
      updatePreview();
    });

    document.addEventListener('change', (event) => {
      const input = event.target.closest('[data-setting]');
      if (!input) return;
      const path = input.dataset.setting;
      store.setPath(draft, path, parseInputValue(input));
      syncDuplicateInputs(path, input);
      queueSave();
      updatePreview();
    });

    $('#publishButton').addEventListener('click', () => {
      clearTimeout(saveTimer);
      store.saveDraft(draft);
      draft = store.publish(draft);
      setSaveStatus(`เผยแพร่ในเครื่องนี้แล้ว · ${new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}`);
      showToast('เผยแพร่แล้ว เปิดหน้าเว็บหลักในอุปกรณ์นี้เพื่อดูผล');
    });

    $('#discardButton').addEventListener('click', () => {
      draft = store.resetDraft();
      renderForm();
      setSaveStatus('ยกเลิก Draft แล้ว');
      showToast('กลับไปใช้ค่าที่เผยแพร่ล่าสุดแล้ว');
    });

    $('#resetDraftButton').addEventListener('click', () => {
      draft = store.resetDraft();
      renderForm();
      setSaveStatus('คืน Draft เป็นค่าที่เผยแพร่แล้ว');
    });

    $('#resetAllButton').addEventListener('click', async () => {
      if (!confirm('ล้างการตั้งค่าและไฟล์อัปโหลดทั้งหมดในอุปกรณ์นี้ใช่หรือไม่?')) return;
      draft = store.resetAll();
      await Promise.allSettled([media.remove('poster'), media.remove('video')]);
      renderForm();
      setSaveStatus('คืนค่าเริ่มต้นทั้งหมดแล้ว');
      showToast('ล้างค่าทั้งหมดแล้ว');
    });

    $('#openPreviewButton').addEventListener('click', () => {
      store.saveDraft(draft);
      window.open('/?preview=draft', '_blank', 'noopener');
    });

    $('#posterFile').addEventListener('change', (event) => {
      handleUpload('poster', event.target.files?.[0]).catch((error) => showToast(error.message, true));
      event.target.value = '';
    });
    $('#videoFile').addEventListener('change', (event) => {
      handleUpload('video', event.target.files?.[0]).catch((error) => showToast(error.message, true));
      event.target.value = '';
    });

    $('#removePosterButton').addEventListener('click', async () => {
      await media.remove('poster');
      if (draft.media.posterMode === 'local') draft.media.posterMode = 'default';
      store.saveDraft(draft);
      renderForm();
      showToast('ลบรูปที่อัปโหลดแล้ว');
    });
    $('#removeVideoButton').addEventListener('click', async () => {
      await media.remove('video');
      if (draft.media.videoMode === 'local') draft.media.videoMode = 'default';
      store.saveDraft(draft);
      renderForm();
      showToast('ลบวิดีโอที่อัปโหลดแล้ว');
    });

    $('#changePinButton').addEventListener('click', () => {
      try {
        store.setAdminPin($('#newPinInput').value);
        $('#newPinInput').value = '';
        showToast('เปลี่ยน PIN แล้ว');
      } catch (error) {
        showToast(error.message, true);
      }
    });

    $('#exportButton').addEventListener('click', downloadJson);
    $('#importFile').addEventListener('change', async (event) => {
      try {
        const file = event.target.files?.[0];
        if (!file) return;
        const parsed = JSON.parse(await file.text());
        draft = store.normalize(parsed);
        store.saveDraft(draft);
        renderForm();
        setSaveStatus('นำเข้าค่าเป็น Draft แล้ว · ยังไม่เผยแพร่');
        showToast('นำเข้าการตั้งค่าแล้ว');
      } catch (error) {
        showToast(`นำเข้าไม่สำเร็จ: ${error.message}`, true);
      } finally {
        event.target.value = '';
      }
    });
  }

  window.addEventListener('DOMContentLoaded', () => {
    setupLogin();
    setupEditor();
  });
})();
