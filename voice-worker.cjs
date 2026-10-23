const { parentPort, workerData } = require('node:worker_threads');
const path = require('node:path');
let runtime, running = false, current = null;
const cache = new Map(), jobs = [];
async function load() {
  if (!runtime) runtime = (async () => {
    const { env } = await import('@huggingface/transformers');
    env.cacheDir = path.join(workerData.userData, 'kokoro-cache'); env.useBrowserCache = false; env.useFSCache = true;
    const { KokoroTTS } = await import('kokoro-js');
    return KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'q8', device: 'cpu' });
  })().catch(error => { runtime = null; throw error; });
  return runtime;
}
async function pump() {
  if (running) return;
  running = true;
  try {
    while (jobs.length) {
      current = jobs.shift(); const job = current;
      try {
        const key = job.voice + '\n' + job.text; let audio = cache.get(key);
        if (!audio) {
          const tts = await load();
          if (job.cancelled) continue;
          const generated = await tts.generate(job.text, { voice: job.voice, speed: .98 });
          if (job.cancelled) continue;
          audio = Buffer.from(generated.toWav()).toString('base64');
          if (job.text.length <= 150) { cache.set(key, audio); if (cache.size > 32) cache.delete(cache.keys().next().value); }
        }
        if (!job.cancelled) parentPort.postMessage({ id: job.id, audio });
      } catch (error) { if (!job.cancelled) parentPort.postMessage({ id: job.id, error: error.message }); }
      finally { current = null; }
    }
  } finally { running = false; }
}
parentPort.on('message', message => {
  if (message.type === 'cancel') {
    const ids = new Set(message.ids);
    if (current && ids.has(current.id)) current.cancelled = true;
    for (let i = jobs.length - 1; i >= 0; i--) if (ids.has(jobs[i].id)) jobs.splice(i, 1);
  } else { jobs.push(message); void pump(); }
});
