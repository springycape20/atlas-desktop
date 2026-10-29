const fs = require('node:fs/promises'),
  path = require('node:path'),
  { randomBytes } = require('node:crypto');
const directory = path.join(__dirname, '../.statistics-demo');
async function start() {
  await fs.mkdir(directory, { recursive: true });
  const tokenFile = path.join(directory, 'admin-token');
  let token;
  try {
    token = (await fs.readFile(tokenFile, 'utf8')).trim();
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    token = randomBytes(32).toString('hex');
    await fs.writeFile(tokenFile, token, { flag: 'wx', mode: 0o600 });
  }
  const server = require('./service.cjs').createReceiver({ directory, adminToken: token });
  server.listen(43127, '127.0.0.1', () =>
    console.log(
      'Local prototype receiver: http://127.0.0.1:43127 · no external listener.\nData is in .statistics-demo (Git/package excluded). Run npm run statistics:snapshot to save a sanitised Insights import.',
    ),
  );
  server.on('error', () => {
    console.error('Local receiver could not start. Check whether port 43127 is already in use.');
    process.exitCode = 1;
  });
}
start().catch(() => {
  console.error('Cannot initialise local receiver storage.');
  process.exitCode = 1;
});
