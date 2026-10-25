// Replaces the built installer with its signed copy, then regenerates the files the in-app
// updater checks against it. Signing changes the installer's bytes, so the blockmap and the
// sha512/size in latest.yml must be rebuilt or every update download would be rejected.
// Usage: node build/finalize-signed-installer.cjs <folder containing the signed installer>
const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto'),
  yaml = require('js-yaml'),
  { buildBlockMap } = require('app-builder-lib/out/targets/blockmap/blockmap');
const { version } = require('../package.json');
const dist = path.join(__dirname, '..', 'dist'),
  name = `ATLAS-Setup-${version}.exe`,
  installer = path.join(dist, name);

async function main() {
  const signedFolder = process.argv[2];
  if (!signedFolder) throw Error('Pass the folder that contains the signed installer.');
  const signed = path.join(signedFolder, name);
  if (!fs.existsSync(signed)) throw Error(`The signed installer ${signed} is missing.`);
  if (fs.statSync(signed).size <= fs.statSync(installer).size)
    throw Error('The signed installer is not larger than the unsigned one, so it does not look signed.');
  fs.copyFileSync(signed, installer);

  const blockmap = installer + '.blockmap';
  fs.rmSync(blockmap, { force: true });
  await buildBlockMap(installer, 'gzip', blockmap);
  const sha512 = crypto.createHash('sha512').update(fs.readFileSync(installer)).digest('base64'),
    size = fs.statSync(installer).size;

  const manifestPath = path.join(dist, 'latest.yml'),
    manifest = yaml.load(fs.readFileSync(manifestPath, 'utf8'));
  const entry = manifest.files.find((file) => decodeURIComponent(file.url) === name);
  if (!entry) throw Error('latest.yml does not list ' + name);
  entry.sha512 = sha512;
  entry.size = size;
  if (manifest.path === name) manifest.sha512 = sha512;
  fs.writeFileSync(manifestPath, yaml.dump(manifest, { lineWidth: -1 }));
  console.log(`Finalized signed ${name}: ${size} bytes, blockmap and latest.yml regenerated.`);
}
main().catch((error) => {
  console.error(error);
  process.exit(1);
});
