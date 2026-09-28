const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');
const release = require('../scripts/release-notes.cjs');
const { packageExtension } = require('../scripts/package.cjs');
function fixture(t, changelog = '## [1.2.3] - 2026-09-28\n\n### 新增\n\n- 自定义跳转秒数。\n') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'videopilot-release-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'extension/icons'), { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ version: '1.2.3' }));
  fs.writeFileSync(path.join(root, 'CHANGELOG.md'), changelog);
  fs.writeFileSync(path.join(root, 'extension/manifest.json'), JSON.stringify({
    manifest_version: 3, name: 'Test', version: '1.2.3',
    action: { default_popup: 'popup.html', default_icon: {16:'icons/16.png'} },
    icons: {16:'icons/16.png'}, content_scripts: [{js:['shared.js', 'content.js']}]
  }));
  for (const asset of ['popup.html','popup.css','popup.js','shared.js','content.js','icons/16.png']) {
    fs.writeFileSync(path.join(root,'extension',asset), `fixture:${asset}`);
  }
  return root;
}
function extractor() {
  assert.equal(typeof release.extractReleaseNotes, 'function', 'version-specific changelog extraction exists');
  return release.extractReleaseNotes;
}

test('release notes preserve only the matching version body, excluding unreleased and older versions', () => {
  const md = '# Changelog\n\n## [Unreleased]\n\n- 尚未发布\n\n## [1.2.3] - 2026-09-28\n\n### 新增\n\n- **快捷键**支持。\n\n## [1.2.2] - 2026-09-27\n\n- 旧版修改\n';
  assert.equal(extractor()(md, '1.2.3'), '### 新增\n\n- **快捷键**支持。\n');
});

test('headings in fenced examples do not terminate a release section', () => {
  const body = '### 示例\n\n```md\n## [9.9.9]\n```\n\n- 实际更新';
  assert.equal(extractor()(`## [1.2.3]\n${body}\n## [1.2.2]\n- old`, '1.2.3'), `${body}\n`);
});

test('commented version templates do not count as duplicate releases', () => {
  const markdown = '<!--\n## [1.2.3]\n- template\n-->\n\n## [1.2.3]\n- Released change\n';
  assert.equal(extractor()(markdown, '1.2.3'), '- Released change\n');
});

test('commented headings inside notes do not truncate later changes', () => {
  const body = '- First change\n<!--\n## [9.9.9]\n-->\n- Second change';
  assert.equal(extractor()(`## [1.2.3]\n${body}\n## [1.2.2]\n- Older`, '1.2.3'), `${body}\n`);
});

test('missing, duplicate and empty changelog entries fail instead of publishing misleading notes', () => {
  for (const markdown of ['## [1.2.30]\n- unrelated', '## [1.2.3]\n\n## [1.2.2]\n- old',
    '## [1.2.3]\n### 新增\n', '## [1.2.3]\n- a\n## [1.2.3]\n- b']) {
    assert.throws(() => extractor()(markdown, '1.2.3'), /CHANGELOG/);
  }
});

test('release preparation validates versions and writes the exact notes file', t => {
  assert.equal(typeof release.prepareRelease, 'function', 'release preparation exists');
  const root = fixture(t);
  const result = release.prepareRelease(root, 'v1.2.3');
  assert.equal(result.version, '1.2.3');
  assert.equal(result.notesPath, path.join(root, 'dist/release-notes.md'));
  assert.equal(fs.readFileSync(result.notesPath,'utf8'), '### 新增\n\n- 自定义跳转秒数。\n');
});

test('tag mismatch with either package or manifest prevents notes generation', t => {
  assert.equal(typeof release.prepareRelease, 'function', 'release preparation exists');
  for (const file of ['package.json','extension/manifest.json']) {
    const root = fixture(t); const target = path.join(root,file);
    const json = JSON.parse(fs.readFileSync(target)); json.version = '1.2.4';
    fs.writeFileSync(target, JSON.stringify(json));
    assert.throws(() => release.prepareRelease(root,'v1.2.3'), /version|版本/);
    assert.equal(fs.existsSync(path.join(root,'dist/release-notes.md')), false);
  }
});

test('invalid tags cannot become release versions or filesystem paths', t => {
  assert.equal(typeof release.prepareRelease, 'function', 'release preparation exists');
  const root = fixture(t);
  for (const tag of ['', undefined, '1.2.3', 'v01.2.3', 'v1.2', 'v1.2.3-beta.1', 'v1.2.3\n', '../v1.2.3', 'v1.2.3;echo x']) {
    assert.throws(() => release.prepareRelease(root,tag), /tag/);
  }
});

test('release CLI exits nonzero for invalid input and emits notes for a valid tag', t => {
  const root = fixture(t), script = path.resolve(__dirname,'../scripts/release-notes.cjs');
  const bad = spawnSync(process.execPath, [script,'v9.9.9'], {cwd:root, encoding:'utf8'});
  assert.notEqual(bad.status, 0);
  const good = spawnSync(process.execPath, [script,'v1.2.3'], {cwd:root, encoding:'utf8'});
  assert.equal(good.status, 0, good.stderr);
  assert.equal(fs.readFileSync(path.join(root,'dist/release-notes.md'),'utf8'), '### 新增\n\n- 自定义跳转秒数。\n');
});

test('packaging refreshes unpacked files and archives a loadable root without development files', t => {
  const root = fixture(t);
  fs.mkdirSync(path.join(root,'dist/VideoPilot'), {recursive:true});
  fs.writeFileSync(path.join(root,'dist/VideoPilot/stale.js'),'old');
  fs.writeFileSync(path.join(root,'extension/.DS_Store'),'junk');
  fs.writeFileSync(path.join(root,'secret.env'),'not a distribution asset');
  const result = packageExtension(root);
  assert.equal(result.directory, path.join(root,'dist/VideoPilot'));
  assert.equal(result.archive, path.join(root,'dist/VideoPilot.zip'));
  assert.equal(fs.existsSync(path.join(result.directory,'stale.js')),false);
  assert.equal(fs.existsSync(path.join(result.directory,'.DS_Store')),false);
  assert.equal(fs.readFileSync(path.join(result.directory,'content.js'),'utf8'),'fixture:content.js');
  const entries = execFileSync('unzip',['-Z1',result.archive],{encoding:'utf8'}).trim().split('\n');
  assert.ok(entries.includes('manifest.json'));
  assert.ok(entries.includes('icons/16.png'));
  assert.ok(!entries.some(entry => /stale|DS_Store|secret|^VideoPilot\//.test(entry)));
  assert.equal(execFileSync('unzip',['-p',result.archive,'popup.js'],{encoding:'utf8'}),'fixture:popup.js');
});

test('missing extension assets fail packaging before replacing an existing distribution', t => {
  const root = fixture(t);
  fs.rmSync(path.join(root,'extension/popup.js'));
  fs.mkdirSync(path.join(root,'dist/VideoPilot'), {recursive:true});
  fs.writeFileSync(path.join(root,'dist/VideoPilot/keep.txt'),'existing');
  assert.throws(() => packageExtension(root), /Missing extension asset/);
  assert.equal(fs.readFileSync(path.join(root,'dist/VideoPilot/keep.txt'),'utf8'),'existing');
});
