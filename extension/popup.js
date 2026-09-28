(() => {
  'use strict';
  const {DEFAULTS, LIMITS, normalizeSettings} = globalThis.VideoPilot;
  const fields = Object.keys(DEFAULTS);
  const inputs = Object.fromEntries(fields.map(key => [key, document.getElementById(key)]));
  const status = document.getElementById('save-status'), error = document.getElementById('form-error');
  let settings = {...DEFAULTS}, saveQueue = Promise.resolve(), saving = false;
  const names = {speed:'日常倍速', boostSpeed:'长按倍速', backwardSeconds:'后退秒数', forwardSeconds:'前进秒数'};
  function statusText(text, state = '') { status.textContent = text; status.dataset.state = state; }
  function render() {
    for (const key of fields) {
      if (typeof DEFAULTS[key] === 'boolean') inputs[key].checked = settings[key];
      else inputs[key].value = settings[key];
      inputs[key].removeAttribute('aria-invalid');
    }
    document.body.dataset.enabled = settings.enabled;
    document.getElementById('settings-fields').disabled = !settings.enabled;
    const mode = document.getElementById('mode-label');
    mode.replaceChildren(document.createElement('i'), document.createTextNode(settings.enabled ? '视频控制已启用' : '视频控制已暂停'));
    const display = document.getElementById('speed-display'), unit = document.createElement('span');
    unit.textContent = '×'; display.replaceChildren(document.createTextNode(String(settings.speed)), unit);
    document.querySelectorAll('[data-speed]').forEach(button => button.setAttribute('aria-pressed', Number(button.dataset.speed) === settings.speed));
    error.hidden = true;
  }
  function save(patch) {
    if (saving) return;
    saving = true;
    const previous = {...settings};
    settings = normalizeSettings({...settings, ...patch}); render();
    const snapshot = {...settings}; statusText('正在保存…');
    document.getElementById('settings-fields').disabled = true;
    inputs.enabled.disabled = true; document.getElementById('reset').disabled = true;
    saveQueue = saveQueue.then(async () => {
      try { await chrome.storage.local.set({settings: snapshot}); statusText('✓ 设置已自动保存'); }
      catch { settings = previous; statusText('保存失败，请重试', 'error'); }
      finally {
        saving = false; render(); inputs.enabled.disabled = false;
        document.getElementById('reset').disabled = false;
      }
    });
  }
  document.getElementById('settings-form').addEventListener('submit', event => event.preventDefault());
  for (const key of fields) inputs[key].addEventListener('change', () => {
    if (typeof DEFAULTS[key] === 'boolean') { save({[key]: inputs[key].checked}); return; }
    const value = inputs[key].valueAsNumber, [min, max] = LIMITS[key];
    if (!Number.isFinite(value) || value < min || value > max) {
      inputs[key].setAttribute('aria-invalid', 'true');
      error.textContent = `${names[key]}请输入 ${min}–${max} 之间的数值。`;
      error.hidden = false; statusText('数值未保存', 'error'); return;
    }
    save({[key]:value});
  });
  document.querySelectorAll('[data-speed]').forEach(button => button.addEventListener('click', () => save({speed:Number(button.dataset.speed)})));
  document.getElementById('reset').addEventListener('click', () => save(DEFAULTS));
  inputs.enabled.disabled = true;
  chrome.storage.local.get('settings').then(result => {
    settings = normalizeSettings(result.settings); render();
    inputs.enabled.disabled = false; document.getElementById('reset').disabled = false;
    statusText('设置自动保存 · 对所有网页生效');
  }).catch(() => { statusText('设置读取失败，请重新打开', 'error'); });
})();
