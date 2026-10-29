const { app } = require('electron');
const assert = require('node:assert/strict'),
  path = require('node:path');
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  try {
    const archive = path.resolve(__dirname, '../dist/win-unpacked/resources/app.asar');
    const stream = 'BT /F1 12 Tf 50 750 Td (Packaged ATLAS PDF text) Tj ET';
    const objects = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
      '<< /Length ' + stream.length + ' >>\nstream\n' + stream + '\nendstream',
    ];
    let source = '%PDF-1.4\n';
    const offsets = [];
    objects.forEach((value, i) => {
      offsets.push(Buffer.byteLength(source));
      source += `${i + 1} 0 obj\n${value}\nendobj\n`;
    });
    const start = Buffer.byteLength(source);
    source +=
      'xref\n0 6\n0000000000 65535 f \n' +
      offsets.map((n) => String(n).padStart(10, '0') + ' 00000 n \n').join('') +
      `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
    const result = await require(path.join(archive, 'document-extract.js')).extractDocument(
      Buffer.from(source),
      '.pdf',
    );
    assert.match(result.pages[0].text, /Packaged ATLAS PDF text/);
    assert(!require('node:fs').existsSync(path.join(archive, 'node_modules/@napi-rs/canvas')));
    assert(
      !require('node:fs').existsSync(
        path.join(archive, 'node_modules/pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf'),
      ),
    );
    console.log('PASS: Packaged PDF text extraction works without native canvas or Liberation fallback fonts.');
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
setTimeout(() => {
  console.error('Packaged PDF extraction timed out');
  app.exit(1);
}, 20000).unref();
