(() => {
  'use strict';
  const { DEFAULTS, normalizeSettings, createController } = globalThis.VideoPilot;
  const videos = new Set(), originalRates = new WeakMap(), roots = new WeakSet(), boundVideos = new WeakSet();
  let settings = { ...DEFAULTS }, preferred = null, initialized = false, revision = 0;
  let overlay = null, label = null, overlayTimer = null;

  function hideOverlay() {
    clearTimeout(overlayTimer);
    if (overlay) overlay.style.setProperty('display', 'none', 'important');
  }
  function notify(video, message, persistent) {
    if (!settings.enabled || !settings.showOverlay || !video.isConnected) return;
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.setAttribute('data-videopilot', '');
      overlay.style.cssText = 'all:initial!important;position:fixed!important;z-index:2147483647!important;pointer-events:none!important;';
      const shadow = overlay.attachShadow({mode: 'closed'});
      const style = document.createElement('style');
      style.textContent = ':host{color-scheme:dark}div{display:flex;align-items:center;gap:9px;padding:11px 17px;border:1px solid #ffffff30;border-radius:12px;background:#142a23ed;color:#fff;box-shadow:0 6px 24px #0003;font:600 14px/1.4 system-ui,sans-serif;white-space:nowrap}i{width:7px;height:7px;background:#b8f28b;border-radius:50%}';
      const box = document.createElement('div'); box.setAttribute('role', 'status');
      box.append(document.createElement('i')); label = document.createElement('span'); box.append(label);
      shadow.append(style, box);
    }
    const parent = document.fullscreenElement || document.documentElement;
    if (overlay.parentNode !== parent) parent.append(overlay);
    const rect = video.getBoundingClientRect();
    overlay.style.setProperty('display', 'block', 'important');
    overlay.style.setProperty('top', `${Math.max(12, rect.top + 20)}px`, 'important');
    overlay.style.setProperty('left', `${Math.max(12, Math.min(innerWidth - 210, rect.left + rect.width / 2 - 85))}px`, 'important');
    label.textContent = message; clearTimeout(overlayTimer);
    if (!persistent) overlayTimer = setTimeout(hideOverlay, 1300);
  }

  function visible(video) {
    if (!video.isConnected) return false;
    const rect = video.getBoundingClientRect(), style = getComputedStyle(video);
    return rect.width > 30 && rect.height > 30 && rect.bottom > 0 && rect.right > 0 &&
      rect.top < innerHeight && rect.left < innerWidth && style.display !== 'none' &&
      style.visibility !== 'hidden' && Number(style.opacity) !== 0;
  }
  function getVideo() {
    const candidates = [...videos].filter(visible);
    const full = document.fullscreenElement;
    const fullscreenVideo = full && candidates.find(video => full === video || full.contains(video));
    if (fullscreenVideo) return fullscreenVideo;
    if (preferred && visible(preferred)) return preferred;
    return candidates.sort((a, b) => {
      if (a.paused !== b.paused) return a.paused ? 1 : -1;
      const ar = a.getBoundingClientRect(), br = b.getBoundingClientRect();
      return br.width * br.height - ar.width * ar.height;
    })[0] || null;
  }
  const controller = createController({getVideo, settings, notify});

  function applyRate(video) {
    try {
      if (settings.enabled) {
        if (!originalRates.has(video)) originalRates.set(video, video.playbackRate);
        video.playbackRate = settings.speed;
      } else if (originalRates.has(video)) {
        video.playbackRate = originalRates.get(video); originalRates.delete(video);
      }
    } catch { /* Some embedded players restrict playback-rate changes. */ }
  }
  function register(video) {
    if (videos.has(video)) return;
    videos.add(video); applyRate(video);
    if (boundVideos.has(video)) return;
    boundVideos.add(video);
    video.addEventListener('loadedmetadata', () => applyRate(video));
    video.addEventListener('pointerdown', () => { preferred = video; }, true);
    video.addEventListener('play', () => { if (visible(video)) preferred = video; });
  }
  function discover(node) {
    if (node.nodeType !== 1 && node.nodeType !== 9 && node.nodeType !== 11) return;
    if (node.tagName === 'VIDEO') register(node);
    node.querySelectorAll('video').forEach(register);
    if (node.shadowRoot) watch(node.shadowRoot);
    for (const element of node.querySelectorAll('*')) {
      if (element.shadowRoot) watch(element.shadowRoot);
    }
  }
  function watch(root) {
    discover(root);
    if (roots.has(root)) return;
    roots.add(root);
    const observer = new MutationObserver(records => {
      for (const record of records) for (const node of record.addedNodes) discover(node);
      for (const video of videos) if (!video.isConnected) { videos.delete(video); if (preferred === video) preferred = null; }
    });
    observer.observe(root, {childList: true, subtree: true});
  }
  function update(next) {
    const previous = settings;
    settings = normalizeSettings(next);
    controller.updateSettings(settings);
    if (!initialized) { initialized = true; watch(document); }
    else if (previous.enabled !== settings.enabled || previous.speed !== settings.speed) videos.forEach(applyRate);
    if (!settings.enabled || !settings.showOverlay) hideOverlay();
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.settings) { revision++; update(changes.settings.newValue); }
  });
  const loadRevision = revision;
  chrome.storage.local.get('settings').then(result => {
    if (revision === loadRevision) update(result.settings);
  }).catch(() => { if (!initialized) update(DEFAULTS); });

  window.addEventListener('keydown', event => { if (initialized) controller.keydown(event); }, true);
  window.addEventListener('keyup', controller.keyup, true);
  window.addEventListener('blur', controller.release);
  window.addEventListener('pagehide', controller.release);
  document.addEventListener('visibilitychange', () => { if (document.hidden) controller.release(); });
  document.addEventListener('fullscreenchange', () => { controller.release(); hideOverlay(); });
})();
