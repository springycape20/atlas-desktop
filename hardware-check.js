const os = require('node:os'),
  { execFile } = require('node:child_process');
const { promisify } = require('node:util');
function assess({ totalBytes, freeBytes, gpus = [] }, modelGiB) {
  const size = Number(modelGiB);
  if (!Number.isFinite(size) || size <= 0 || size > 1024)
    throw Error('Enter a model weight size between 0 and 1024 GiB.');
  const requiredGiB = Math.round((size * 1.25 + 2) * 10) / 10;
  const freeGiB = Math.round((freeBytes / 1073741824) * 10) / 10;
  return {
    totalGiB: Math.round((totalBytes / 1073741824) * 10) / 10,
    freeGiB,
    gpus,
    requiredGiB,
    ramFits: freeGiB >= requiredGiB,
    gpuFits: gpus.some((row) => row.freeGiB >= requiredGiB),
  };
}
async function check(modelGiB, { system = os, run = promisify(execFile) } = {}) {
  let gpus = [];
  try {
    const { stdout } = await run(
      'nvidia-smi',
      ['--query-gpu=name,memory.total,memory.free', '--format=csv,noheader,nounits'],
      { windowsHide: true, shell: false, timeout: 5000, maxBuffer: 16384 },
    );
    gpus = stdout
      .trim()
      .split(/\r?\n/)
      .slice(0, 16)
      .map((line) => {
        const parts = line.split(',').map((value) => value.trim());
        return { name: parts[0], totalGiB: Number(parts[1]) / 1024, freeGiB: Number(parts[2]) / 1024 };
      })
      .filter((row) => Number.isFinite(row.freeGiB) && row.freeGiB >= 0);
  } catch {}
  return {
    ...assess({ totalBytes: system.totalmem(), freeBytes: system.freemem(), gpus }, modelGiB),
    cpu: system.cpus()[0]?.model || 'Unknown CPU',
    threads: system.cpus().length,
    gpuNote: gpus.length
      ? 'NVIDIA driver-reported memory.'
      : 'GPU memory unavailable. Non-NVIDIA GPUs may still support inference in your chosen server.',
  };
}
module.exports = { assess, check };
