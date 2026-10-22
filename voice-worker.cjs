const { parentPort, workerData } = require('node:worker_threads');
const path = require('node:path');
let runtime;
const cache=new Map();let queue=Promise.resolve();
async function load(){if(!runtime)runtime=(async()=>{const {env}=await import('@huggingface/transformers');env.cacheDir=path.join(workerData.userData,'kokoro-cache');env.useBrowserCache=false;env.useFSCache=true;const {KokoroTTS}=await import('kokoro-js');return KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX',{dtype:'q8',device:'cpu'})})().catch(error=>{runtime=null;throw error});return runtime}
parentPort.on('message',message=>{queue=queue.catch(()=>{}).then(async()=>{try{const key=message.voice+'\n'+message.text;let audio=cache.get(key);if(!audio){const tts=await load();const generated=await tts.generate(message.text,{voice:message.voice,speed:.98});audio=Buffer.from(generated.toWav()).toString('base64');if(message.text.length<=150){cache.set(key,audio);if(cache.size>32)cache.delete(cache.keys().next().value)}}parentPort.postMessage({id:message.id,audio})}catch(error){parentPort.postMessage({id:message.id,error:error.message})}})});
