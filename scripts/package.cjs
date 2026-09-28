const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');

function packageExtension(root) {
  const source = path.join(root, 'extension');
  const manifest = JSON.parse(fs.readFileSync(path.join(source, 'manifest.json'), 'utf8'));
  const required = [manifest.action.default_popup, 'popup.css', 'popup.js',
    ...Object.values(manifest.icons), ...Object.values(manifest.action.default_icon || {}),
    ...manifest.content_scripts.flatMap(script => [...(script.js || []), ...(script.css || [])])];
  for (const asset of required) {
    if (!fs.existsSync(path.join(source, asset))) throw new Error(`Missing extension asset: ${asset}`);
  }
  const out = path.join(root, 'dist');
  const directory = path.join(out, 'VideoPilot');
  const archive = path.join(out, 'VideoPilot.zip');
  fs.mkdirSync(out, { recursive: true });
  fs.rmSync(directory, { recursive: true, force: true });
  fs.cpSync(source, directory, { recursive: true, filter: file => path.basename(file) !== '.DS_Store' });
  fs.rmSync(archive, { force: true });
  execFileSync('zip', ['-q', '-r', archive, '.'], { cwd: directory });
  return { directory, archive };
}

if (require.main === module) {
  try {
    const { directory, archive } = packageExtension(path.resolve(__dirname, '..'));
    console.log(`Unpacked: ${directory}\nZIP: ${archive} (${fs.statSync(archive).size} bytes)`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { packageExtension };
