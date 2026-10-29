const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
async function prepare(root = path.resolve(__dirname, '..')) {
  const out = path.join(root, 'dist', 'compliance');
  await fs.mkdir(out, { recursive: true });
  const lockBytes = await fs.readFile(path.join(root, 'package-lock.json'));
  const lock = JSON.parse(lockBytes);
  const components = [],
    texts = [
      'ATLAS third-party notices\nThese notices do not replace corresponding-source or other licence obligations.\n',
    ];
  for (const [location, entry] of Object.entries(lock.packages || {})) {
    if (!location || entry.dev || !location.startsWith('node_modules/')) continue;
    const folder = path.resolve(root, location);
    if (!folder.startsWith(path.resolve(root, 'node_modules') + path.sep)) throw Error('Unsafe dependency path.');
    let pkg;
    try {
      pkg = JSON.parse(await fs.readFile(path.join(folder, 'package.json')));
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    if (entry.version && pkg.version !== entry.version)
      throw Error('Installed dependency differs from lockfile: ' + location);
    const notices = [];
    const noticeNames = await fs.readdir(folder);
    if (pkg.name === 'node-pty') noticeNames.push('deps/winpty/LICENSE');
    if (pkg.name === 'pdfjs-dist') {
      for (const subdir of ['cmaps', 'iccs', 'standard_fonts', 'wasm'])
        for (const name of await fs.readdir(path.join(folder, subdir)))
          if (/^LICENSE/.test(name) && name !== 'LICENSE_LIBERATION') noticeNames.push(subdir + '/' + name);
    }
    for (const name of noticeNames) {
      if (
        !/^(?:licen[cs]e|copying|notice)(?:[._-].*)?$/i.test(name) &&
        !(pkg.name === '@img/sharp-win32-x64' && name === 'README.md') &&
        !(pkg.name === 'node-pty' && name === 'deps/winpty/LICENSE') &&
        !(pkg.name === 'pdfjs-dist' && name.includes('/LICENSE'))
      )
        continue;
      const file = path.join(folder, name),
        stat = await fs.lstat(file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 5 * 1024 * 1024) continue;
      const bytes = await fs.readFile(file);
      notices.push({ file: name, sha256: createHash('sha256').update(bytes).digest('hex') });
      texts.push(`\n----- ${pkg.name}@${pkg.version}: ${name} -----\n${bytes.toString('utf8')}\n`);
    }
    components.push({
      type: 'library',
      name: pkg.name,
      version: pkg.version,
      purl: `pkg:npm/${pkg.name.replace('@', '%40')}@${pkg.version}`,
      licenses:
        typeof pkg.license === 'string' ? [{ expression: pkg.license }] : [{ license: { name: 'Review required' } }],
      properties: [
        { name: 'atlas:location', value: location },
        { name: 'atlas:notice-inventory', value: JSON.stringify(notices) },
        { name: 'npm:integrity', value: entry.integrity || '' },
      ],
    });
  }
  const sources = JSON.parse(await fs.readFile(path.join(root, 'legal', 'license-sources.json')));
  for (const source of sources) {
    if (path.basename(source.file) !== source.file) throw Error('Invalid licence source path.');
    const bytes = await fs.readFile(path.join(root, 'legal', 'licenses', source.file));
    if (createHash('sha256').update(bytes).digest('hex') !== source.sha256)
      throw Error('Licence-source checksum mismatch: ' + source.file);
    texts.push(
      `\n----- ${source.file} -----\nSource: ${source.url}\nSHA-256: ${source.sha256}\n\n${bytes.toString('utf8')}\n`,
    );
  }
  const { version } = JSON.parse(await fs.readFile(path.join(root, 'package.json')));
  await fs.writeFile(path.join(out, 'THIRD-PARTY-NOTICES.txt'), texts.join(''));
  await fs.writeFile(
    path.join(out, 'sbom.cdx.json'),
    JSON.stringify(
      {
        bomFormat: 'CycloneDX',
        specVersion: '1.6',
        version: 1,
        metadata: {
          component: { type: 'application', name: 'ATLAS', version },
          properties: [
            { name: 'atlas:package-lock-sha256', value: createHash('sha256').update(lockBytes).digest('hex') },
            {
              name: 'atlas:scope',
              value:
                'Installed production npm inventory; native subcomponents and downloaded resources require the accompanying source review.',
            },
          ],
        },
        components,
      },
      null,
      2,
    ),
  );
  await fs.copyFile(path.join(root, 'docs', 'PATCH-RELEASE-REVIEW.md'), path.join(out, 'SOURCE-REVIEW.md'));
  await fs.copyFile(path.join(root, 'docs', 'RELEASE-0.10.0-REVIEW.md'), path.join(out, 'CURRENT-REVIEW.md'));
  await fs.copyFile(path.join(root, 'legal', 'release-review.json'), path.join(out, 'RELEASE-REVIEW.json'));
  await fs.copyFile(path.join(root, 'legal', 'license-sources.json'), path.join(out, 'LICENSE-SOURCES.json'));
  await fs.copyFile(path.join(root, 'docs', 'PRIVACY.md'), path.join(out, 'PRIVACY.md'));
  console.log(`Prepared notices and a ${components.length}-component npm inventory in ${out}`);
  return { out, components };
}
module.exports = async (context) => prepare(context.appDir);
module.exports.prepare = prepare;
if (require.main === module)
  prepare().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
