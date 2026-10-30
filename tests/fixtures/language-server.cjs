// A real stdio child fixture: no provider, network or installed language server.
let buffer = Buffer.alloc(0),
  published = false;
const reply = value => {
  const body = Buffer.from(JSON.stringify({ jsonrpc: '2.0', ...value }));
  const frame = Buffer.concat([Buffer.from('Content-Length: ' + body.length + '\r\n\r\n'), body]);
  // Split headers/payloads to exercise incremental framing with multibyte text.
  process.stdout.write(frame.subarray(0, 11));
  process.stdout.write(frame.subarray(11));
};
process.stdin.on('data', part => {
  buffer = Buffer.concat([buffer, part]);
  while (true) {
    const end = buffer.indexOf('\r\n\r\n'); if (end < 0) return;
    const size = Number(buffer.subarray(0, end).toString().match(/Content-Length: (\d+)/)[1]);
    if (buffer.length < end + 4 + size) return;
    const message = JSON.parse(buffer.subarray(end + 4, end + 4 + size));
    buffer = buffer.subarray(end + 4 + size);
    if (message.method === 'initialize') reply({ id: message.id, result: { capabilities: { definitionProvider: true, referencesProvider: true } } });
    if (message.method === 'textDocument/didOpen' && !(process.argv.includes('--publish-once') && published)) {
      published = true;
      // --normalize-uri mimics servers that rewrite file:///C:/ as file:///c%3A/ on Windows.
      const uri = message.params.textDocument.uri.replace(/^file:\/\/\/([A-Za-z]):/, (all, drive) => process.argv.includes('--normalize-uri') ? 'file:///' + drive.toLowerCase() + '%3A' : all);
      reply({ method: 'textDocument/publishDiagnostics', params: { uri, diagnostics: [{ range: { start: { line: 0, character: 2 } }, severity: 2, message: 'Fixture café diagnostic' }] } });
    }
    if (['textDocument/definition', 'textDocument/references'].includes(message.method)) {
      if (process.argv.includes('--bad-frame')) { process.stdout.write('Content-Length: 99999999\r\n\r\n'); continue; }
      if (process.argv.includes('--timeout')) continue;
      reply({ id: message.id, result: [{ uri: message.params.textDocument.uri, range: { start: { line: 0, character: 6 } } }, { uri: 'file:///outside/private.js', range: { start: { line: 1, character: 0 } } }] });
    }
  }
});
