// Run with Electron, passing the actual main.js to verify a copied checkout.
// Uses fresh app data and never submits a provider task.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs'),
  path = require('node:path');
const main = path.resolve(process.argv[2] || path.join(__dirname, '..', 'main.js'));
const data = process.env.ATLAS_LAUNCH_TEST_DATA;
if (!data) throw Error('Set ATLAS_LAUNCH_TEST_DATA to a temporary folder.');
fs.mkdirSync(data, { recursive: true });
fs.writeFileSync(
  path.join(data, 'settings.json'),
  JSON.stringify({ voiceEngine: 'windows', speakResponses: false, wakeWordEnabled: false }),
);
app.setPath('userData', data);
app.disableHardwareAcceleration();
let done = false,
  checking = false;
const fail = (error) => {
  console.error('FAIL: ' + error.message);
  app.exit(1);
};
process.on('unhandledRejection', fail);
process.on('uncaughtException', fail);
const timeout = setTimeout(
  () => fail(Error('The actual app did not finish startup and expose its Tools menu.')),
  30000,
);
const timer = setInterval(async () => {
  if (done || checking) return;
  const win = BrowserWindow.getAllWindows().find((win) => !win.isDestroyed());
  if (!win || win.webContents.isLoadingMainFrame()) return;
  checking = true;
  try {
    const result = await win.webContents.executeJavaScript(
      `(async()=>{const codex=document.querySelector('#colabCodexModel'),claude=document.querySelector('#colabClaudeModel'),graph=document.querySelector('#colabGraph');if(!document.querySelector('#colabTools')||!window.atlas?.integrations||!window.atlasColab||!graph||!codex?.options.length||!claude?.options.length)return null;await atlasColab.ready;if(codex.options.length<2||claude.options.length<2)throw Error('Colab models were not populated');graph.click();const dialog=document.querySelector('.colab-graph-dialog');if(!dialog?.open)throw Error('Workflow graph did not open');dialog.close();const tools=await atlas.integrations();return {ready:Array.isArray(tools.integrations),title:document.title,codexModels:codex.options.length,claudeModels:claude.options.length};})()`,
    );
    if (!result) return;
    if (!result.ready) throw Error('The integration IPC did not return its configuration.');
    done = true;
    clearTimeout(timeout);
    clearInterval(timer);
    console.log(
      'PASS: Actual main.js boots, creates the window, populates both model menus, opens the workflow graph and serves integration IPC: ' +
        main,
    );
    await new Promise((resolve, reject) => {
      const child = require('node:child_process').spawn(
        process.execPath,
        [path.join(__dirname, 'second-instance.smoke.cjs'), main],
        { env: process.env, windowsHide: true, stdio: 'inherit' },
      );
      child.once('error', reject);
      child.once('exit', (code) => (code === 0 ? resolve() : reject(Error('Duplicate-instance launch failed.'))));
    });
    console.log('PASS: A second launch exits cleanly and creates no additional app window.');
    app.quit();
  } catch (error) {
    fail(error);
  } finally {
    checking = false;
  }
}, 100);
require(main);
