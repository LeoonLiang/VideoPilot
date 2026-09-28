(function (root) {
  'use strict';
  const DEFAULTS = Object.freeze({ enabled: true, speed: 1, boostSpeed: 3,
    backwardSeconds: 5, forwardSeconds: 5, showOverlay: true });
  const LIMITS = Object.freeze({ speed: [0.25, 4], boostSpeed: [0.25, 8],
    backwardSeconds: [1, 120], forwardSeconds: [1, 120] });

  function normalizeSettings(input) {
    const source = input && typeof input === 'object' ? input : {};
    const result = { ...DEFAULTS };
    for (const [key, [min, max]] of Object.entries(LIMITS)) {
      const value = source[key];
      if (typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max) {
        result[key] = Math.round(value * 100) / 100;
      }
    }
    for (const key of ['enabled', 'showOverlay']) {
      if (typeof source[key] === 'boolean') result[key] = source[key];
    }
    return result;
  }

  function seek(video, delta) {
    if (!Number.isFinite(video.currentTime) || !Number.isFinite(delta)) return null;
    let target = video.currentTime + delta;
    const ranges = video.seekable;
    if (ranges && ranges.length) {
      const endpoints = [];
      let inside = false;
      for (let i = 0; i < ranges.length; i++) {
        const start = ranges.start(i), end = ranges.end(i);
        endpoints.push(start, end);
        if (target >= start && target <= end) inside = true;
      }
      if (!inside) target = endpoints.reduce((a, b) => Math.abs(a - target) <= Math.abs(b - target) ? a : b);
    } else if (Number.isFinite(video.duration) && video.duration > 0) {
      target = Math.max(0, Math.min(video.duration, target));
    } else return null;
    video.currentTime = target;
    return target;
  }

  function editable(event) {
    const path = event.composedPath ? event.composedPath() : [event.target];
    return path.some(node => node && (node.isContentEditable ||
      ['INPUT', 'TEXTAREA', 'SELECT'].includes(node.tagName) ||
      ['textbox', 'combobox', 'searchbox'].includes(node.getAttribute?.('role'))));
  }

  function createController({ getVideo, settings, notify = () => {},
    schedule = setTimeout, cancel = clearTimeout }) {
    let config = normalizeSettings(settings), timer = null, gesture = null;
    const pressed = new Set();
    const keys = new Set(['KeyZ', 'KeyX', 'KeyS', 'KeyD', 'KeyR']);
    const holdDelay = 200;
    const eventTime = event => Number.isFinite(event.timeStamp) ? event.timeStamp : performance.now();
    const report = (video, message, persistent = false) => {
      if (config.showOverlay) notify(video, message, persistent);
    };
    const ignored = event => event.isComposing || event.keyCode === 229 || event.ctrlKey ||
      event.metaKey || event.altKey || event.shiftKey || editable(event);
    function jump(video, delta) {
      const before = video.currentTime;
      const target = seek(video, delta);
      report(video, target === null ? '此视频暂不支持跳转' : `${delta < 0 ? '后退' : '前进'} ${Math.abs(target - before).toFixed(1).replace(/\.0$/, '')} 秒`);
    }
    function endGesture(allowTap = false) {
      if (timer !== null) { cancel(timer); timer = null; }
      const previous = gesture; gesture = null;
      if (!previous) return;
      try {
        if (previous.restoreRate !== null) {
          previous.video.playbackRate = previous.restoreRate;
          report(previous.video, `恢复 ${previous.restoreRate}×`);
        } else if (allowTap && !previous.held && previous.video.isConnected !== false) {
          jump(previous.video, config.forwardSeconds);
        }
      } catch { report(previous.video, '此视频暂不支持该操作'); }
    }
    function release() { endGesture(); pressed.clear(); }
    function keydown(event) {
      if (!config.enabled || !keys.has(event.code) || ignored(event)) return;
      const video = getVideo();
      if (!video) return;
      event.preventDefault(); event.stopImmediatePropagation();
      const repeatable = event.code === 'KeyS' || event.code === 'KeyD';
      // Only held speed keys repeat; release/blur clears ownership of that hold.
      if (event.repeat ? !repeatable || !pressed.has(event.code) : pressed.has(event.code)) return;
      pressed.add(event.code);
      try {
        if (event.code === 'KeyX') {
          // Keep the original target; a tap seeks only after the key is released.
          const current = { video, held: false, restoreRate: null, startedAt: eventTime(event) };
          gesture = current;
          timer = schedule(() => {
            timer = null;
            if (gesture !== current || !pressed.has('KeyX') || !config.enabled || video.isConnected === false) return;
            current.held = true;
            current.restoreRate = video.playbackRate;
            try { video.playbackRate = config.boostSpeed; report(video, `${config.boostSpeed}× 加速中`, true); }
            catch { report(video, '此视频不支持这个倍速'); }
          }, holdDelay);
        } else if (event.code === 'KeyZ') {
          jump(video, -config.backwardSeconds);
        } else {
          // A direct speed change ends X first, so its later keyup cannot undo it.
          endGesture();
          const rate = event.code === 'KeyR' ? 1 :
            Math.round((video.playbackRate + (event.code === 'KeyS' ? -0.1 : 0.1)) * 100) / 100;
          video.playbackRate = Math.max(LIMITS.speed[0], Math.min(LIMITS.speed[1], rate));
          report(video, `${event.code === 'KeyR' ? '重置 ' : ''}${video.playbackRate}×`);
        }
      } catch { report(video, '此视频暂不支持该操作'); }
    }
    function keyup(event) {
      const handled = pressed.has(event.code);
      pressed.delete(event.code);
      if (event.code === 'KeyX') {
        // Event timestamps still distinguish a long hold if a busy page delays the timer.
        const elapsed = gesture ? eventTime(event) - gesture.startedAt : Infinity;
        endGesture(handled && config.enabled && !ignored(event) && elapsed >= 0 && elapsed < holdDelay);
      }
      if (handled) { event.preventDefault(); event.stopImmediatePropagation(); }
    }
    return { keydown, keyup, release,
      updateSettings(next) { release(); config = normalizeSettings(next); } };
  }

  const api = { DEFAULTS, LIMITS, normalizeSettings, seek, createController };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.VideoPilot = api;
})(globalThis);
