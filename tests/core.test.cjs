const test = require('node:test');
const assert = require('node:assert/strict');
const api = require('../extension/shared.js');

function video(overrides = {}) {
  return { currentTime: 40, duration: 100, playbackRate: 1.5, paused: true,
    seekable: { length: 0 }, play() { this.paused = false; return Promise.resolve(); },
    pause() { this.paused = true; }, ...overrides };
}
function event(code, overrides = {}) {
  return { code, repeat: false, target: { tagName: 'BODY' },
    preventDefault() { this.prevented = true; }, stopImmediatePropagation() {}, ...overrides };
}
function setup(settings = {}, media = video()) {
  assert.equal(typeof api.createController, 'function', 'keyboard controller exists');
  const timers = new Map(); let id = 0, selected = media;
  const controller = api.createController({ getVideo: () => selected, settings,
    schedule: fn => { timers.set(++id, fn); return id; }, cancel: key => timers.delete(key) });
  return { controller, media, select(next) { selected = next; },
    hold() { for (const [key, fn] of timers) { timers.delete(key); fn(); } } };
}
function tap(controller, code) { controller.keydown(event(code)); controller.keyup(event(code)); }

test('invalid stored numbers and booleans cannot disable controls or corrupt playback', () => {
  assert.equal(typeof api.normalizeSettings, 'function', 'settings normalization exists');
  const result = api.normalizeSettings({ speed: '', boostSpeed: Infinity, backwardSeconds: -1, forwardSeconds: 999, enabled: 'false' });
  assert.equal(result.speed, 1); assert.equal(result.boostSpeed, 3);
  assert.equal(result.backwardSeconds, 5); assert.equal(result.forwardSeconds, 5);
  assert.equal(result.enabled, true);
  assert.equal(api.normalizeSettings({ speed: 1.75, enabled: false }).speed, 1.75);
  assert.equal(api.normalizeSettings({ enabled: false }).enabled, false);
});

test('seeking clamps to the start and end of finite videos', () => {
  assert.equal(typeof api.seek, 'function', 'seek behavior exists');
  const v = video({ currentTime: 3 }); api.seek(v, -10); assert.equal(v.currentTime, 0);
  v.currentTime = 96; api.seek(v, 10); assert.equal(v.currentTime, 100);
});

test('live seeking respects DVR bounds and does not jump into gaps', () => {
  assert.equal(typeof api.seek, 'function', 'seek behavior exists');
  const v = video({ duration: Infinity, currentTime: 105,
    seekable: { length: 2, start: i => [100, 140][i], end: i => [120, 180][i] } });
  api.seek(v, -20); assert.equal(v.currentTime, 100);
  api.seek(v, 29); assert.equal(v.currentTime, 120);
  api.seek(v, 100); assert.equal(v.currentTime, 180);
  const unseekable = video({ duration: Infinity });
  assert.equal(api.seek(unseekable, 10), null); assert.equal(unseekable.currentTime, 40);
});

test('Z seeks immediately and a short X seeks only on release using independent durations', () => {
  const {controller, media} = setup({ backwardSeconds: 7, forwardSeconds: 12 });
  controller.keydown(event('KeyZ')); assert.equal(media.currentTime, 33);
  controller.keydown(event('KeyX')); assert.equal(media.currentTime, 33);
  controller.keyup(event('KeyX')); assert.equal(media.currentTime, 45);
});

test('holding X boosts after the threshold and restores without seeking on either edge', () => {
  const {controller, media, hold} = setup({ boostSpeed: 4 });
  controller.keydown(event('KeyX')); assert.equal(media.playbackRate, 1.5);
  assert.equal(media.currentTime, 40);
  hold(); assert.equal(media.playbackRate, 4);
  controller.keyup(event('KeyX')); assert.equal(media.playbackRate, 1.5);
  assert.equal(media.currentTime, 40);
});

test('a short X cancels the timer and repeated held X does not overwrite the restore speed', () => {
  const {controller, media, hold} = setup();
  tap(controller, 'KeyX'); hold(); assert.equal(media.playbackRate, 1.5); assert.equal(media.currentTime, 45);
  controller.keydown(event('KeyX')); hold(); controller.keydown(event('KeyX', {repeat: true})); hold();
  controller.keyup(event('KeyX')); assert.equal(media.playbackRate, 1.5); assert.equal(media.currentTime, 45);
});

test('focus loss restores acceleration and clears stuck keys', () => {
  const {controller, media, hold} = setup();
  controller.keydown(event('KeyX')); hold(); controller.release(); assert.equal(media.playbackRate, 1.5);
  controller.keyup(event('KeyX')); assert.equal(media.currentTime, 40);
  controller.keydown(event('KeyX')); hold(); assert.equal(media.playbackRate, 3);
});

test('disabling while boosting restores rate and allows page shortcuts', () => {
  const {controller, media, hold} = setup();
  controller.keydown(event('KeyX')); hold(); controller.updateSettings({ enabled: false });
  controller.keyup(event('KeyX'));
  assert.equal(media.playbackRate, 1.5);
  const key = event('KeyX'); controller.keydown(key); assert.equal(media.currentTime, 40); assert.equal(key.prevented, undefined);
});

test('input fields, editable shadow paths, IME, and modified keys remain untouched', () => {
  const {controller, media} = setup();
  for (const options of [{target: {tagName: 'INPUT'}}, {target: {tagName: 'TEXTAREA'}},
    {target: {tagName: 'SELECT'}}, {target: {isContentEditable: true}}, {ctrlKey: true}, {metaKey: true},
    {altKey: true}, {shiftKey: true}, {isComposing: true}, {keyCode: 229},
    {composedPath: () => [{isContentEditable: true}, {tagName: 'BODY'}]}]) {
    for (const code of ['KeyZ','KeyX','KeyS','KeyD','KeyR']) {
      const key = event(code, options); controller.keydown(key); controller.keyup(event(code, options));
      assert.equal(key.prevented, undefined); assert.equal(media.currentTime, 40);
      assert.equal(media.playbackRate, 1.5); assert.equal(media.paused, true);
    }
  }
});

test('keys remain available to the page if there is no video', () => {
  const {controller} = setup({}, null); const key = event('KeyX'); controller.keydown(key);
  assert.equal(key.prevented, undefined);
});

test('key repeat does not multiply tap actions', () => {
  const {controller, media} = setup(); controller.keydown(event('KeyX'));
  controller.keydown(event('KeyX', {repeat: true})); assert.equal(media.currentTime, 40);
  controller.keyup(event('KeyX')); assert.equal(media.currentTime, 45);
  tap(controller, 'KeyX'); assert.equal(media.currentTime, 50);
  controller.keydown(event('KeyZ')); controller.keydown(event('KeyZ', {repeat:true}));
  assert.equal(media.currentTime, 45);
  controller.keydown(event('KeyR')); media.playbackRate = 1.7;
  controller.keydown(event('KeyR', {repeat:true})); assert.equal(media.playbackRate, 1.7);
});

test('held S and D repeatedly change speed in 0.1 increments until released', () => {
  for (const [key, rates] of [['KeyS',[1.4,1.3,1.2]],['KeyD',[1.6,1.7,1.8]]]) {
    const {controller, media, hold} = setup();
    controller.keydown(event(key)); assert.equal(media.playbackRate,rates[0]);
    controller.keydown(event(key,{repeat:true})); assert.equal(media.playbackRate,rates[1]);
    controller.keydown(event(key,{repeat:true})); assert.equal(media.playbackRate,rates[2]);
    controller.keyup(event(key)); hold();
    controller.keydown(event(key,{repeat:true}));
    assert.equal(media.playbackRate,rates[2]); assert.equal(media.currentTime,40);
  }
});

test('held speed keys stop at the minimum and maximum rates', () => {
  for (const [key, start, want] of [['KeyS',0.35,0.25],['KeyD',3.9,4]]) {
    const {controller, media} = setup({},video({playbackRate:start}));
    controller.keydown(event(key));
    for (let i=0; i<5; i++) controller.keydown(event(key,{repeat:true}));
    assert.equal(media.playbackRate,want);
  }
});

test('blur, settings changes and input focus do not keep adjusting a held speed key', () => {
  for (const key of ['KeyS','KeyD']) {
    const {controller, media} = setup();
    controller.keydown(event(key)); const rate = media.playbackRate;
    controller.keydown(event(key,{repeat:true,target:{tagName:'INPUT'}}));
    controller.keydown(event(key,{repeat:true,ctrlKey:true}));
    assert.equal(media.playbackRate,rate);
    controller.release(); controller.keydown(event(key,{repeat:true}));
    assert.equal(media.playbackRate,rate);
    controller.keyup(event(key)); controller.keydown(event(key));
    const nextRate = media.playbackRate;
    controller.updateSettings({speed:2}); controller.keydown(event(key,{repeat:true}));
    assert.equal(media.playbackRate,nextRate);
  }
});

test('S and D adjust only current speed by 0.1 and R resets to 1 without changing playback state', () => {
  for (const paused of [true, false]) {
    const {controller, media, hold} = setup({speed:2}, video({playbackRate:1.75, paused}));
    tap(controller, 'KeyS'); assert.equal(media.playbackRate, 1.65);
    tap(controller, 'KeyD'); hold(); assert.equal(media.playbackRate, 1.75);
    tap(controller, 'KeyR'); assert.equal(media.playbackRate, 1);
    assert.equal(media.paused, paused); assert.equal(media.currentTime, 40);
  }
});

test('direct speed adjustments clamp safely and avoid floating-point drift', () => {
  const {controller, media} = setup({}, video({playbackRate:0.3}));
  tap(controller, 'KeyS'); assert.equal(media.playbackRate, 0.25);
  tap(controller, 'KeyS'); assert.equal(media.playbackRate, 0.25);
  media.playbackRate = 3.95; tap(controller, 'KeyD'); assert.equal(media.playbackRate, 4);
  tap(controller, 'KeyD'); assert.equal(media.playbackRate, 4);
  tap(controller, 'KeyR');
  for (let i=0; i<3; i++) tap(controller, 'KeyD');
  assert.equal(media.playbackRate, 1.3);
});

test('pending X is canceled on blur or settings changes without a delayed seek', () => {
  for (const cancel of [controller => controller.release(),
    controller => controller.updateSettings({enabled:false}), controller => controller.updateSettings({forwardSeconds:9})]) {
    const {controller, media, hold} = setup();
    controller.keydown(event('KeyX')); cancel(controller); hold(); controller.keyup(event('KeyX'));
    assert.equal(media.currentTime, 40); assert.equal(media.playbackRate, 1.5);
  }
});

test('X released in an editable or modified context does not seek', () => {
  for (const options of [{target:{tagName:'INPUT'}}, {ctrlKey:true}, {shiftKey:true}, {isComposing:true}]) {
    const {controller, media, hold} = setup();
    controller.keydown(event('KeyX')); controller.keyup(event('KeyX',options)); hold();
    assert.equal(media.currentTime, 40); assert.equal(media.playbackRate, 1.5);
  }
});

test('X keeps its original target when video selection changes before release', () => {
  const {controller, media, select} = setup(); const other = video({currentTime:70});
  controller.keydown(event('KeyX')); select(other); controller.keyup(event('KeyX'));
  assert.equal(media.currentTime,45); assert.equal(other.currentTime,70);
  tap(controller,'KeyS'); assert.equal(other.playbackRate,1.4); assert.equal(media.playbackRate,1.5);
});

test('direct speed keys cancel a pending or active X gesture and survive X release', () => {
  for (const held of [false, true]) for (const [key,want] of [['KeyS',1.4],['KeyD',1.6],['KeyR',1]]) {
    const {controller, media, hold} = setup();
    controller.keydown(event('KeyX')); if (held) hold();
    tap(controller,key); controller.keyup(event('KeyX')); hold();
    assert.equal(media.playbackRate,want); assert.equal(media.currentTime,40);
  }
});

test('removing the X target cancels its pending action', () => {
  const {controller, media, hold} = setup();
  controller.keydown(event('KeyX')); media.isConnected = false; hold(); controller.keyup(event('KeyX'));
  assert.equal(media.playbackRate,1.5); assert.equal(media.currentTime,40);
});

test('X uses actual press duration when the page delays the hold timer', () => {
  for (const [releasedAt, wantTime] of [[1199,45],[1200,40],[1500,40]]) {
    const {controller, media, hold} = setup();
    controller.keydown(event('KeyX', {timeStamp:1000}));
    controller.keyup(event('KeyX', {timeStamp:releasedAt}));
    hold();
    assert.equal(media.currentTime, wantTime);
    assert.equal(media.playbackRate,1.5);
  }
});
