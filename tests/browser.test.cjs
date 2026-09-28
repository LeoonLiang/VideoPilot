const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const os = require('node:os');
const crypto = require('node:crypto');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
let browser, server, base;

before(async () => {
  server = http.createServer((req, res) => {
    const file = path.join(root, decodeURIComponent(req.url.split('?')[0]));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    if (fs.existsSync(file) && fs.statSync(file).isFile()) {
      const mime = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webm': 'video/webm', '.png': 'image/png'};
      res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
      const size = fs.statSync(file).size;
      res.setHeader('Accept-Ranges', 'bytes');
      if (req.headers.range) {
        const match = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range);
        const start = Number(match[1]), end = match[2] ? Number(match[2]) : size - 1;
        res.writeHead(206, {'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1});
        fs.createReadStream(file, {start, end}).pipe(res);
      } else { res.setHeader('Content-Length', size); fs.createReadStream(file).pipe(res); }
    } else {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end('<!doctype html><html lang="zh-CN"><body><video id="main" muted controls style="width:640px;height:360px;background:#222" src="/tests/fixtures/sample.webm"></video><input aria-label="输入测试"><div contenteditable="true">编辑区</div></body></html>');
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
    args: ['--autoplay-policy=no-user-gesture-required'] });
});
after(async () => { await browser?.close(); await new Promise(resolve => server?.close(resolve)); });

async function storage(page, settings = {}) {
  await page.addInitScript(initial => {
    const listeners = [];
    window.chrome = { storage: { local: {
      async get() { return { settings: window.savedSettings }; },
      async set({settings}) {
        if (window.rejectStorage) throw Error('disk full');
        const oldValue = window.savedSettings; window.savedSettings = settings;
        listeners.forEach(fn => fn({settings: {oldValue, newValue: settings}}, 'local'));
      }
    }, onChanged: {addListener(fn) {listeners.push(fn);}} } };
    window.savedSettings = initial;
  }, settings);
}
async function content(settings = {}) {
  const page = await browser.newPage(); await storage(page, settings); await page.goto(base);
  await page.waitForFunction(() => document.querySelector('video').readyState >= 1);
  await page.addScriptTag({path: path.join(root, 'extension/shared.js')});
  if (fs.existsSync(path.join(root, 'extension/content.js'))) await page.addScriptTag({path: path.join(root, 'extension/content.js')});
  return page;
}

test('real video distinguishes X tap/hold and supports direct S/D/R speed control', async () => {
  const page = await content({ speed: 1.75, boostSpeed: 4, backwardSeconds: 2, forwardSeconds: 7 });
  try {
    assert.equal(await page.$eval('video', v => v.playbackRate), 1.75);
    await page.$eval('video', v => {v.currentTime = 10;});
    await page.keyboard.press('z'); assert.equal(await page.$eval('video', v => v.currentTime), 8);
    await page.keyboard.down('x'); assert.equal(await page.$eval('video', v => v.currentTime), 8);
    await page.keyboard.up('x'); assert.equal(await page.$eval('video', v => v.currentTime), 15);
    await page.keyboard.press('s'); assert.equal(await page.$eval('video', v => v.playbackRate), 1.65);
    await page.keyboard.press('d'); assert.equal(await page.$eval('video', v => v.playbackRate), 1.75);
    assert.equal(await page.$eval('video', v => v.paused), true);
    await page.keyboard.down('x'); await page.waitForTimeout(250);
    assert.equal(await page.$eval('video', v => v.playbackRate), 4);
    assert.equal(await page.$eval('video', v => v.currentTime), 15);
    await page.keyboard.up('x'); assert.equal(await page.$eval('video', v => v.playbackRate), 1.75);
    assert.equal(await page.$eval('video', v => v.currentTime), 15);
    await page.keyboard.press('r'); assert.equal(await page.$eval('video', v => v.playbackRate), 1);
    assert.equal(await page.evaluate(() => savedSettings.speed), 1.75);
  } finally { await page.close(); }
});

test('held S/D repeats adjust the selected video and stop on release or blur', async () => {
  const page = await content({speed:1.5});
  try {
    await page.keyboard.down('d');
    await page.keyboard.down('d');
    await page.keyboard.down('d');
    assert.equal(await page.$eval('video', v => v.playbackRate), 1.8);
    await page.keyboard.up('d');
    await page.waitForTimeout(250);
    assert.equal(await page.$eval('video', v => v.playbackRate), 1.8);
    await page.keyboard.down('s');
    await page.keyboard.down('s');
    await page.keyboard.down('s');
    assert.equal(await page.$eval('video', v => v.playbackRate), 1.5);
    await page.evaluate(() => dispatchEvent(new Event('blur')));
    await page.keyboard.down('s');
    assert.equal(await page.$eval('video', v => v.playbackRate), 1.5);
    await page.keyboard.up('s');
    assert.equal(await page.evaluate(() => savedSettings.speed), 1.5);
  } finally { await page.close(); }
});

test('typing is isolated; live settings, blur, and disable recover acceleration', async () => {
  const page = await content({ speed: 1.5 });
  try {
    await page.$eval('video', v => {v.currentTime = 10;});
    await page.getByRole('textbox', {name:'输入测试'}).fill('zxsdr');
    for (const key of ['z','x','s','d','r']) await page.keyboard.press(key);
    assert.equal(await page.$eval('video', v => v.currentTime), 10);
    assert.equal(await page.$eval('video', v => v.playbackRate), 1.5);
    await page.getByRole('textbox', {name:'输入测试'}).blur();
    await page.keyboard.down('x'); await page.waitForTimeout(250);
    assert.equal(await page.$eval('video', v => v.playbackRate), 3);
    await page.evaluate(() => dispatchEvent(new Event('blur')));
    assert.equal(await page.$eval('video', v => v.playbackRate), 1.5); await page.keyboard.up('x');
    await page.evaluate(() => chrome.storage.local.set({settings: {...savedSettings, speed: 2}}));
    assert.equal(await page.$eval('video', v => v.playbackRate), 2);
    await page.keyboard.down('x'); await page.waitForTimeout(250);
    await page.evaluate(() => chrome.storage.local.set({settings: {...savedSettings, enabled: false}}));
    await page.keyboard.up('x'); assert.equal(await page.$eval('video', v => v.playbackRate), 1);
    await page.keyboard.press('x'); assert.equal(await page.$eval('video', v => v.currentTime), 10);
  } finally { await page.close(); }
});

test('new videos receive settings, and explicit selection targets a second video', async () => {
  const page = await content({speed: 2});
  try {
    await page.evaluate(() => { const v = document.createElement('video'); v.id='second'; v.src='/tests/fixtures/sample.webm';
      v.muted=true; v.style='width:300px;height:170px;background:#555'; document.body.prepend(v); });
    await page.waitForFunction(() => document.querySelector('#second').readyState >= 1);
    assert.equal(await page.$eval('#second', v => v.playbackRate), 2);
    await page.locator('#second').click(); await page.keyboard.press('x');
    assert.equal(await page.$eval('#second', v => v.currentTime), 5);
    assert.equal(await page.$eval('#main', v => v.currentTime), 0);
    await page.keyboard.press('s'); assert.equal(await page.$eval('#second', v => v.playbackRate), 1.9);
    assert.equal(await page.$eval('#main', v => v.playbackRate), 2);
    await page.keyboard.press('d'); assert.equal(await page.$eval('#second', v => v.playbackRate), 2);
    await page.keyboard.press('r'); assert.equal(await page.$eval('#second', v => v.playbackRate), 1);
    assert.equal(await page.$eval('#main', v => v.playbackRate), 2);
    assert.equal(await page.evaluate(() => savedSettings.speed), 2);
  } finally { await page.close(); }
});

test('popup persists custom settings, rejects invalid values and resets defaults', async () => {
  const page = await browser.newPage(); await storage(page); await page.goto(`${base}/extension/popup.html`);
  try {
    assert.equal(await page.locator('#speed').count(), 1, 'popup has a speed setting');
    await page.locator('#speed').fill('1.75'); await page.locator('#speed').press('Tab');
    await page.waitForFunction(() => savedSettings.speed === 1.75);
    await page.locator('#forwardSeconds').fill('12'); await page.locator('#forwardSeconds').press('Tab');
    await page.waitForFunction(() => savedSettings.forwardSeconds === 12);
    await page.locator('#speed').fill('99'); await page.locator('#speed').press('Tab');
    assert.equal(await page.evaluate(() => savedSettings.speed), 1.75);
    await page.getByRole('button', {name:'恢复默认'}).click();
    await page.waitForFunction(() => savedSettings.speed === 1 && savedSettings.forwardSeconds === 5);
    await fs.promises.mkdir(path.join(root, 'artifacts'), {recursive:true});
    await page.setViewportSize({width: 380, height: 600});
    await page.screenshot({path: path.join(root, 'artifacts/popup.png'), fullPage:true});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 380);
    const popupHeight = await page.evaluate(() => document.body.scrollHeight);
    assert.ok(popupHeight <= 600, `popup height ${popupHeight} fits Chrome’s 600 px limit`);
    await page.evaluate(() => {window.rejectStorage = true;});
    await page.locator('#speed').fill('2'); await page.locator('#speed').press('Tab');
    await page.waitForFunction(() => document.querySelector('#save-status').textContent.includes('失败'));
    assert.equal(await page.evaluate(() => savedSettings.speed), 1);
    assert.equal(await page.locator('#speed').inputValue(), '1', 'failed writes restore the saved value');
    await page.evaluate(() => {window.rejectStorage = false;});
    await page.locator('#forwardSeconds').fill('9'); await page.locator('#forwardSeconds').press('Tab');
    await page.waitForFunction(() => savedSettings.forwardSeconds === 9);
    assert.equal(await page.evaluate(() => savedSettings.speed), 1, 'later writes do not resurrect a failed speed change');
  } finally {await page.close();}
});

test('reattached open shadow videos remain controllable', async () => {
  const page = await content({speed:1.5});
  try {
    await page.evaluate(() => {
      const host = document.createElement('div'); host.id='shadow-player';
      document.querySelector('#main').style.display = 'none';
      const v = document.createElement('video'); v.src='/tests/fixtures/sample.webm';
      v.style='width:300px;height:170px;background:#555';
      host.attachShadow({mode:'open'}).append(v); document.body.prepend(host);
    });
    await page.waitForFunction(() => document.querySelector('#shadow-player').shadowRoot.querySelector('video').readyState >= 1);
    await page.locator('#shadow-player video').click();
    await page.keyboard.press('x'); assert.equal(await page.locator('#shadow-player video').evaluate(v => v.currentTime), 5);
    await page.evaluate(() => {window.detachedPlayer=document.querySelector('#shadow-player'); detachedPlayer.remove();});
    await page.evaluate(() => document.body.prepend(detachedPlayer));
    await page.keyboard.press('x');
    assert.equal(await page.locator('#shadow-player video').evaluate(v => v.currentTime), 10);
    await page.evaluate(() => chrome.storage.local.set({settings: {...savedSettings, speed:2}}));
    assert.equal(await page.locator('#shadow-player video').evaluate(v => v.playbackRate), 2);
  } finally {await page.close();}
});

test('unpacked MV3 extension injects into pages and frames and persists popup settings', async () => {
  const extension = path.join(root, 'extension');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'videopilot-test-'));
  const id = crypto.createHash('sha256').update(extension).digest('hex').slice(0,32)
    .replace(/[0-9a-f]/g, character => String.fromCharCode(97 + parseInt(character,16)));
  let context;
  try {
    context = await chromium.launchPersistentContext(profile, {headless:true,
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
      args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`, '--autoplay-policy=no-user-gesture-required']});
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${id}/popup.html`);
    assert.equal(await popup.evaluate(() => chrome.runtime.getManifest().name), 'VideoPilot · 视频随心控');
    await popup.locator('#speed').fill('1.75'); await popup.locator('#speed').press('Tab');
    await popup.waitForFunction(async () => (await chrome.storage.local.get('settings')).settings?.speed === 1.75);
    const page = await context.newPage(); await page.goto(base);
    await page.waitForFunction(() => document.querySelector('video').readyState >= 1 && document.querySelector('video').playbackRate === 1.75);
    await page.keyboard.press('x'); assert.equal(await page.$eval('video', v => v.currentTime), 5);
    await popup.locator('#speed').fill('2'); await popup.locator('#speed').press('Tab');
    await page.waitForFunction(() => document.querySelector('video').playbackRate === 2);
    await popup.reload(); assert.equal(await popup.locator('#speed').inputValue(), '2');
    await page.evaluate(() => { const frame = document.createElement('iframe'); frame.src='/frame'; frame.style='width:700px;height:460px'; document.body.prepend(frame); });
    const frame = await page.waitForEvent('framenavigated', {predicate: f => f.url().endsWith('/frame')});
    await frame.waitForFunction(() => document.querySelector('video')?.playbackRate === 2 && document.querySelector('video')?.readyState >= 1);
    await frame.locator('input').focus(); await frame.locator('input').blur();
    await page.keyboard.press('x');
    assert.equal(await frame.$eval('video', v => v.currentTime), 5);
    await page.keyboard.press('s'); assert.equal(await frame.$eval('video', v => v.playbackRate), 1.9);
    await page.keyboard.press('d'); assert.equal(await frame.$eval('video', v => v.playbackRate), 2);
    await page.keyboard.down('x'); await frame.waitForFunction(() => document.querySelector('video').playbackRate === 3);
    await page.keyboard.up('x'); assert.equal(await frame.$eval('video', v => v.currentTime), 5);
    assert.equal(await frame.$eval('video', v => v.playbackRate), 2);
    await page.keyboard.press('r'); assert.equal(await frame.$eval('video', v => v.playbackRate), 1);
    assert.equal(await page.$eval('video', v => v.playbackRate), 2);
    assert.equal(await popup.evaluate(async () => (await chrome.storage.local.get('settings')).settings.speed), 2);
    await popup.locator('#enabled').uncheck();
    await page.waitForFunction(() => document.querySelector('video').playbackRate === 1);
    await frame.waitForFunction(() => document.querySelector('video').playbackRate === 1);
  } finally { await context?.close(); fs.rmSync(profile,{recursive:true,force:true}); }
});

test('fullscreen video takes priority over a previously selected video', async () => {
  const page = await content();
  try {
    await page.evaluate(() => {
      const wrapper = document.createElement('div'); wrapper.id='player';
      const v = document.createElement('video'); v.id='second'; v.src='/tests/fixtures/sample.webm';
      v.muted=true; v.style='width:300px;height:170px;background:#555';
      wrapper.append(v); document.body.prepend(wrapper);
    });
    await page.waitForFunction(() => document.querySelector('#second').readyState >= 1);
    await page.locator('#main').click({position:{x:100,y:30}});
    await page.evaluate(() => document.querySelector('#main').pause());
    await page.evaluate(() => new Promise((resolve, reject) => {
      document.addEventListener('fullscreenchange', resolve, {once:true});
      document.querySelector('#player').requestFullscreen().catch(reject);
    }));
    await page.keyboard.press('x');
    assert.equal(await page.$eval('#second', v => v.currentTime), 5);
    assert.ok(await page.$eval('#main', v => v.currentTime) < 1);
  } finally {await page.close();}
});
