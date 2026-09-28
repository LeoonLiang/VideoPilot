const fs = require('node:fs');
const path = require('node:path');

function extractReleaseNotes(markdown, version) {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const headings = [];
  let fence = null, inComment = false;
  for (let index = 0; index < lines.length; index++) {
    let line = lines[index];
    if (fence) {
      const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
      if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = null;
      continue;
    }
    // Ignore hidden Markdown templates, while retaining the original body verbatim.
    let visible = '', cursor = 0;
    while (cursor < line.length) {
      if (inComment) {
        const end = line.indexOf('-->', cursor);
        if (end === -1) break;
        inComment = false; cursor = end + 3;
      } else {
        const start = line.indexOf('<!--', cursor);
        if (start === -1) { visible += line.slice(cursor); break; }
        visible += line.slice(cursor, start);
        inComment = true; cursor = start + 4;
      }
    }
    line = visible;
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (marker) { fence = marker[1]; continue; }
    if (/^##[ \t]+/.test(line)) {
      const match = /^##[ \t]+\[([^\]]+)\](?:[ \t]+.*)?$/.exec(line);
      headings.push({ index, version: match?.[1] });
    }
  }
  const matches = headings.filter(heading => heading.version === version);
  if (matches.length !== 1) throw new Error(`CHANGELOG must contain exactly one ## [${version}] section (found ${matches.length}).`);
  const heading = matches[0];
  const next = headings[headings.indexOf(heading) + 1];
  const notes = lines.slice(heading.index + 1, next?.index ?? lines.length).join('\n').trim();
  if (!notes.replace(/^#{1,6}[ \t]+.*$/gm, '').replace(/<!--[\s\S]*?-->/g, '').trim()) {
    throw new Error(`CHANGELOG section [${version}] has no release notes.`);
  }
  return `${notes}\n`;
}

function prepareRelease(root, tag) {
  if (typeof tag !== 'string' || !/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(tag) || tag.trim() !== tag) {
    throw new Error('Release tag must use vMAJOR.MINOR.PATCH, for example v1.0.0.');
  }
  const version = tag.slice(1);
  for (const file of ['package.json', 'extension/manifest.json']) {
    const data = JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
    if (data.version !== version) throw new Error(`${file} version ${data.version} does not match tag ${tag}.`);
  }
  const notes = extractReleaseNotes(fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8'), version);
  const notesPath = path.join(root, 'dist/release-notes.md');
  fs.mkdirSync(path.dirname(notesPath), { recursive: true });
  fs.writeFileSync(notesPath, notes);
  return { version, notesPath };
}

if (require.main === module) {
  try {
    const result = prepareRelease(process.cwd(), process.argv[2]);
    console.log(`Prepared ${result.version}: ${result.notesPath}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { extractReleaseNotes, prepareRelease };
