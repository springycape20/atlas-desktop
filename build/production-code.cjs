const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { minify } = require('terser');
const CleanCSS = require('clean-css');

const legalComment = /@licen[cs]e|@preserve|copyright|SPDX|permission is hereby granted|Prism|^!/i;
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
function banner(license) {
  if (license.includes('*/')) throw Error('Invalid licence comment.');
  return `/*! ${license.trim()}\nThird-party notices remain applicable. */`;
}
async function minifyJavaScript(source, license) {
  const result = await minify(source, {
    compress: false,
    mangle: { toplevel: false, properties: false },
    keep_fnames: true,
    keep_classnames: true,
    sourceMap: false,
    format: { comments: (_node, comment) => legalComment.test(comment.value), preamble: banner(license) },
  });
  if (!result.code || result.map) throw Error('Minifier did not produce map-free JavaScript.');
  return result.code + '\n';
}
function minifyStyles(source, license) {
  // Preserve copyright/licence comments even when upstream omitted the ! marker.
  const annotated = source.replace(/\/\*([\s\S]*?)\*\//g, (comment, text) =>
    legalComment.test(text) && !text.startsWith('!') ? `/*!${text}*/` : comment,
  );
  const result = new CleanCSS({
    level: { 1: { specialComments: 'all' } },
    rebase: false,
    inline: ['none'],
    sourceMap: false,
  }).minify(annotated);
  if (result.errors.length) throw Error('Stylesheet minification failed: ' + result.errors.join('; '));
  return banner(license) + '\n' + result.styles + '\n';
}
async function prepareProductionCode(root = path.resolve(__dirname, '..')) {
  const outputParent = path.join(root, 'dist');
  await fs.mkdir(outputParent, { recursive: true });
  if ((await fs.lstat(outputParent)).isSymbolicLink()) throw Error('Production output cannot be a link.');
  const output = path.join(outputParent, 'production-code');
  await fs.mkdir(output, { recursive: true });
  if ((await fs.lstat(output)).isSymbolicLink()) throw Error('Production code cannot be a link.');
  // Only this fixed, flat generated directory is cleaned. Source files are never rewritten.
  for (const name of await fs.readdir(output)) {
    const file = path.join(output, name);
    const stat = await fs.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink()) throw Error('Unexpected entry in production-code.');
    await fs.unlink(file);
  }
  const license = await fs.readFile(path.join(root, 'LICENSE'), 'utf8');
  const files = [];
  for (const name of (await fs.readdir(root)).sort()) {
    if (!/\.(?:js|cjs|css)$/.test(name)) continue;
    const sourceFile = path.join(root, name);
    const stat = await fs.lstat(sourceFile);
    if (!stat.isFile() || stat.isSymbolicLink()) throw Error('Production input must be an ordinary file: ' + name);
    const source = await fs.readFile(sourceFile);
    // Prism's generated grammars are already minified and carry the full upstream notice.
    const code =
      name === 'syntax-highlight.js'
        ? source
        : name.endsWith('.css')
          ? minifyStyles(source.toString('utf8'), license)
          : await minifyJavaScript(source.toString('utf8'), license);
    await fs.writeFile(path.join(output, name), code);
    files.push({
      file: name,
      sourceSha256: hash(source),
      outputSha256: hash(code),
      sourceBytes: source.length,
      outputBytes: Buffer.byteLength(code),
    });
  }
  return {
    schemaVersion: 1,
    licence: 'MIT',
    sourceMaps: false,
    tools: { terser: require('terser/package.json').version, cleanCss: require('clean-css/package.json').version },
    files,
  };
}
module.exports = { prepareProductionCode, minifyJavaScript, minifyStyles };
if (require.main === module)
  prepareProductionCode()
    .then((report) => console.log(`Prepared ${report.files.length} production code files without rewriting source.`))
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
