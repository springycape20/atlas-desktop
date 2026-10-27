const $ = (s) => document.querySelector(s),
  orb = $('#orb'),
  sub = $('#sub'),
  mic = $('#mic'),
  wave = $('#wave'),
  response = $('#response'),
  output = $('#output');
let cwd = '',
  conversationId = localStorage.getItem('atlas.activeConversation') || '',
  historyCache = [],
  listening = false,
  audioCtx = null,
  stream = null,
  processor = null,
  source = null,
  chunks = [],
  recordStarted = 0,
  stopTimer = null,
  speechStartedAt = 0,
  lastVoiceAt = 0,
  wakeGeneration = 0,
  wakeOpening = false,
  wakeListening = false,
  wakeProcessing = false,
  wakeChunks = [],
  wakeSpeechStarted = 0,
  wakeLastVoiceAt = 0,
  recordingPurpose = 'manual',
  settings = {},
  elevenPlayer = null,
  elevenObjectUrl = '';
if (location.protocol === 'file:') {
  $('#connection').textContent = 'OPEN VIA START-CLAUDE-UI.CMD';
  $('#connection').style.color = 'var(--amber)';
  sub.textContent = 'CLOSE THIS FILE AND LAUNCH START-CLAUDE-UI.CMD FOR MIC ACCESS';
  mic.disabled = true;
  mic.title = 'Open the local site using Start-Claude-UI.cmd';
}
for (let i = 0; i < 34; i++) {
  const bar = document.createElement('i');
  bar.style.setProperty('--h', `${3 + Math.random() * 18}px`);
  wave.append(bar);
}
$('#voiceStatus').textContent = 'LOCAL WHISPER';
$('#speechStatus').textContent = 'AVAILABLE';
window.atlas.onProviderProgress(({ provider, status }) => {
  if ($('#sessionStatus').textContent === 'PROCESSING') {
    if (provider) $('#coreEngine').textContent = provider.toUpperCase();
    sub.textContent = (status || 'Working').toUpperCase();
  }
});
function resetListen() {
  listening = false;
  mic.classList.remove('active');
  orb.classList.remove('listening');
  wave.classList.remove('on');
  if ($('#sessionStatus').textContent === 'LISTENING') $('#sessionStatus').textContent = 'STANDBY';
  if ($('#greeting').textContent === 'I’m listening.') $('#greeting').textContent = 'At your service.';
}
function joinAudio(parts) {
  const size = parts.reduce((n, p) => n + p.length, 0),
    joined = new Float32Array(size);
  let offset = 0;
  for (const p of parts) {
    joined.set(p, offset);
    offset += p.length;
  }
  return joined;
}
function resampleAudio(input, fromRate, toRate) {
  if (fromRate === toRate) return input;
  const length = Math.floor((input.length * toRate) / fromRate),
    out = new Float32Array(length),
    ratio = fromRate / toRate;
  for (let i = 0; i < length; i++) {
    const pos = i * ratio,
      left = Math.floor(pos),
      fraction = pos - left;
    out[i] = (input[left] || 0) * (1 - fraction) + (input[Math.min(left + 1, input.length - 1)] || 0) * fraction;
  }
  return out;
}
function makeWav(samples) {
  const wav = new ArrayBuffer(44 + samples.length * 2),
    view = new DataView(wav),
    write = (s, o) => {
      for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i));
    };
  write('RIFF', 0);
  view.setUint32(4, 36 + samples.length * 2, true);
  write('WAVE', 8);
  write('fmt ', 12);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 16000, true);
  view.setUint32(28, 32000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write('data', 36);
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 32768 : s * 32767, true);
  }
  return new Uint8Array(wav);
}
function updateWakeIndicator(label, active = false) {
  const chip = $('#wakeIndicator');
  chip.textContent = label;
  chip.classList.toggle('active', active);
  mic.classList.toggle('wake', active);
}
function stopWakeListener() {
  wakeGeneration++;
  if (!wakeListening) return;
  wakeListening = false;
  wakeProcessing = false;
  wakeChunks = [];
  wakeSpeechStarted = 0;
  wakeLastVoiceAt = 0;
  try {
    processor?.disconnect();
    source?.disconnect();
  } catch {}
  stream?.getTracks().forEach((track) => track.stop());
  audioCtx?.close().catch(() => {});
  processor = null;
  source = null;
  stream = null;
  audioCtx = null;
  updateWakeIndicator('WAKE WORD OFF', false);
}
async function startWakeListener() {
  if (document.body.dataset.workspace === 'colab') return;
  if (wakeOpening || recordingOpening) return;
  if (
    orb.classList.contains('speaking') ||
    !settings.wakeWordEnabled ||
    wakeListening ||
    listening ||
    $('#send').disabled ||
    location.protocol === 'file:'
  )
    return;
  const generation = wakeGeneration;
  wakeOpening = true;
  try {
    const audio = { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true };
    if (settings.voiceDeviceId) audio.deviceId = { exact: settings.voiceDeviceId };
    const wakeStream = await navigator.mediaDevices.getUserMedia({ audio });
    if (generation !== wakeGeneration || listening || recordingOpening) {
      wakeStream.getTracks().forEach((t) => t.stop());
      return;
    }
    stream = wakeStream;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    source = audioCtx.createMediaStreamSource(stream);
    processor = audioCtx.createScriptProcessor(4096, 1, 1);
    wakeChunks = [];
    wakeListening = true;
    updateWakeIndicator('LISTENING FOR “HEY ATLAS”', true);
    $('#voiceStatus').textContent = 'WAKE WORD ACTIVE';
    processor.onaudioprocess = (e) => {
      if (!wakeListening || wakeProcessing) return;
      const data = e.inputBuffer.getChannelData(0);
      let energy = 0,
        count = 0;
      for (let i = 0; i < data.length; i += 4) {
        energy += data[i] * data[i];
        count++;
      }
      const level = Math.sqrt(energy / Math.max(1, count)),
        now = Date.now();
      if (level > 0.01) {
        wakeSpeechStarted ||= now;
        wakeLastVoiceAt = now;
      }
      if (wakeSpeechStarted) {
        wakeChunks.push(new Float32Array(data));
        if ((now - wakeLastVoiceAt > 1250 && now - wakeSpeechStarted > 450) || now - wakeSpeechStarted > 10000)
          void inspectWakeUtterance(audioCtx.sampleRate);
      }
    };
    source.connect(processor);
    processor.connect(audioCtx.destination);
  } catch (error) {
    wakeListening = false;
    updateWakeIndicator('WAKE MIC UNAVAILABLE', false);
    toast('Could not start Hey Atlas listening. Check microphone access in Windows settings.');
  } finally {
    wakeOpening = false;
  }
}
async function inspectWakeUtterance(rate) {
  if (!wakeListening || wakeProcessing || !wakeChunks.length) return;
  wakeProcessing = true;
  const generation = wakeGeneration,
    captured = wakeChunks;
  wakeChunks = [];
  wakeSpeechStarted = 0;
  wakeLastVoiceAt = 0;
  try {
    const samples = resampleAudio(joinAudio(captured), rate, 16000),
      heard = await window.atlas.transcribe(makeWav(samples));
    if (generation !== wakeGeneration) return;
    const match = heard.match(/\b(?:hey|hi|okay|ok)\s+(?:atlas|atlis|atlass|atless|add?less)\b/i);
    if (match) {
      const command = heard
        .slice(match.index + match[0].length)
        .replace(/^[\s,.:;!?-]+/, '')
        .trim();
      stopWakeListener();
      if (command.length > 1) {
        $('#prompt').value = command;
        $('#form').requestSubmit();
      } else {
        $('#greeting').textContent = 'At your service.';
        sub.textContent = 'GO AHEAD · I’M LISTENING';
        cue(720);
        void startRecording({ purpose: 'wake', timeoutMs: 20000 });
      }
    }
  } catch {
  } finally {
    wakeProcessing = false;
  }
}
async function startRecording(options = {}) {
  if (listening || recordingOpening) return;
  if (options.purpose === 'followup' && !pendingFollowup) return;
  stopSpeaking();
  stopInterruptionMonitor();
  stopWakeListener();
  const epoch = ++recordEpoch;
  recordingOpening = true;
  recordingPurpose = options.purpose || 'manual';
  recordingQuestionVersion = pendingFollowup?.version ?? -1;
  try {
    const audio = { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true };
    if (settings.voiceDeviceId) audio.deviceId = { exact: settings.voiceDeviceId };
    const capturedStream = await navigator.mediaDevices.getUserMedia({ audio });
    if (epoch !== recordEpoch) {
      capturedStream.getTracks().forEach((t) => t.stop());
      return;
    }
    stream = capturedStream;
    audioCtx = new AudioContext();
    source = audioCtx.createMediaStreamSource(stream);
    processor = audioCtx.createScriptProcessor(2048, 1, 1);
    chunks = options.preRoll ? [resampleAudio(options.preRoll, options.sampleRate, audioCtx.sampleRate)] : [];
    recordStarted = Date.now();
    speechStartedAt = options.preRoll ? recordStarted : 0;
    lastVoiceAt = speechStartedAt;
    processor.onaudioprocess = (e) => {
      if (!listening || epoch !== recordEpoch) return;
      const data = e.inputBuffer.getChannelData(0);
      chunks.push(new Float32Array(data));
      let energy = 0;
      for (let i = 0; i < data.length; i += 4) energy += data[i] * data[i];
      const level = Math.sqrt(energy / (data.length / 4)),
        now = Date.now();
      document.documentElement.style.setProperty('--input-level', Math.min(1, level * 18));
      if (level > 0.012) {
        speechStartedAt ||= now;
        lastVoiceAt = now;
      }
      if (speechStartedAt && now - speechStartedAt > 450 && now - lastVoiceAt > (settings.endSilenceMs || 1000))
        void finishRecording();
    };
    source.connect(processor);
    processor.connect(audioCtx.destination);
    listening = true;
    mic.classList.add('active');
    orb.classList.add('listening');
    wave.classList.add('on');
    $('#sessionStatus').textContent = 'LISTENING';
    $('#greeting').textContent = 'I’m listening.';
    $('#voiceStatus').textContent = 'RECORDING';
    sub.textContent = 'Speak naturally. I’ll send when you finish.';
    stopTimer = setTimeout(() => void finishRecording(), Math.min(24000, options.timeoutMs || 24000));
  } catch (error) {
    if (epoch !== recordEpoch) return;
    resetListen();
    $('#sessionStatus').textContent = 'ATTENTION';
    sub.textContent = 'Microphone unavailable — you can type below.';
    toast(error.message);
  } finally {
    if (epoch === recordEpoch) recordingOpening = false;
  }
}
async function finishRecording() {
  if (!listening) return;
  const epoch = recordEpoch,
    purpose = recordingPurpose,
    questionVersion = recordingQuestionVersion,
    heardVoice = speechStartedAt > 0,
    captured = chunks,
    context = audioCtx,
    rate = context?.sampleRate || 16000;
  pendingVoiceMetrics = {
    captureMs: Date.now() - recordStarted,
    endSilenceMs: lastVoiceAt ? Date.now() - lastVoiceAt : null,
  };
  clearTimeout(stopTimer);
  chunks = [];
  recordingPurpose = 'manual';
  try {
    processor?.disconnect();
    source?.disconnect();
  } catch {}
  stream?.getTracks().forEach((t) => t.stop());
  audioCtx = null;
  stream = null;
  processor = null;
  source = null;
  resetListen();
  const stillCurrent = () =>
    epoch === recordEpoch && (purpose !== 'followup' || pendingFollowup?.version === questionVersion);
  try {
    await context?.close();
    if (!stillCurrent()) return;
    if (!heardVoice) {
      $('#sessionStatus').textContent = 'STANDBY';
      sub.textContent =
        purpose === 'followup'
          ? 'Answer when you’re ready, or dismiss the question.'
          : 'No speech heard. Tap the microphone to try again.';
      return;
    }
    $('#voiceStatus').textContent = 'TRANSCRIBING';
    $('#sessionStatus').textContent = 'PROCESSING';
    sub.textContent = 'Understanding your words…';
    orb.classList.add('thinking');
    const raw = joinAudio(captured);
    let samples = resampleAudio(raw, rate, 16000);
    // Trim silent edges and clamp the actual sample count, not just the wall timer.
    let first = 0,
      last = samples.length;
    while (first < last && Math.abs(samples[first]) < 0.004) first++;
    while (last > first && Math.abs(samples[last - 1]) < 0.004) last--;
    samples = samples.subarray(Math.max(0, first - 3200), Math.min(samples.length, last + 4000)).subarray(0, 400000);
    if (samples.length < 1600) {
      $('#sessionStatus').textContent = 'STANDBY';
      return;
    }
    const transcript = await timedTranscription(makeWav(samples));
    if (!stillCurrent()) return;
    if (/^(?:stop|cancel|wait|pause)[.! ]*$/i.test(transcript.trim())) {
      clearFollowup();
      stopSpeaking();
      $('#sessionStatus').textContent = 'STANDBY';
      sub.textContent = 'Stopped. Ready when you are.';
      return;
    }
    $('#sessionStatus').textContent = 'STANDBY';
    if (transcript.trim()) {
      $('#prompt').value = transcript.trim();
      $('#form').requestSubmit();
    } else sub.textContent = 'I didn’t catch that. Try again or type below.';
  } catch (error) {
    if (stillCurrent()) {
      $('#sessionStatus').textContent = 'ATTENTION';
      sub.textContent = 'Couldn’t transcribe that. You can retry or type below.';
      toast(error.message || 'Transcription failed');
    }
  } finally {
    if (epoch === recordEpoch) {
      $('#voiceStatus').textContent = 'LOCAL WHISPER';
      orb.classList.remove('thinking');
      if (settings.wakeWordEnabled && !listening && !recordingOpening && !orb.classList.contains('speaking'))
        void startWakeListener();
    }
  }
}

mic.addEventListener('click', () => {
  if (listening) finishRecording();
  else if (wakeListening) {
    stopWakeListener();
    startRecording();
  } else startRecording();
});
function cue(freq = 500) {
  try {
    audioCtx ??= new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator(),
      g = audioCtx.createGain();
    o.frequency.value = freq;
    o.type = 'sine';
    g.gain.setValueAtTime(0.0001, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.025, audioCtx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.16);
    o.connect(g);
    g.connect(audioCtx.destination);
    o.start();
    o.stop(audioCtx.currentTime + 0.17);
  } catch {}
}

function toast(t) {
  const el = $('#toast');
  el.textContent = t;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 3300);
}
const modelIdPattern = /^[A-Za-z0-9._:/-]{1,100}$/;
function renderModelList(provider) {
  const select = $(`#${provider}Model`),
    selected = settings[`${provider}Model`] || '',
    models = new Map(
      [
        ...(settings[`${provider}Models`] || []).map((id) => ({ id, name: id })),
        ...(selected ? [{ id: selected, name: selected }] : []),
        ...(window.atlasDiscoveredModels?.[provider]?.models || []),
      ].map((m) => [m.id, m]),
    );
  select.replaceChildren(new Option('Provider default', ''));
  for (const { id, name } of models.values()) select.add(new Option(name, id));
  select.value = selected;
}
async function refreshMicrophones() {
  const select = $('#micSelect'),
    previous = settings.voiceDeviceId || select.value;
  try {
    const devices = await navigator.mediaDevices.enumerateDevices(),
      inputs = devices.filter((d) => d.kind === 'audioinput');
    select.replaceChildren(new Option('System default microphone', ''));
    inputs.forEach((d, i) => select.add(new Option(d.label || `Microphone ${i + 1}`, d.deviceId)));
    select.value = inputs.some((d) => d.deviceId === previous) ? previous : '';
    settings.voiceDeviceId = select.value;
    $('#micNote').textContent = inputs.some((d) => !d.label)
      ? 'Device names may appear after the first recording permission is granted.'
      : 'Choose which microphone ATLAS listens to.';
  } catch {
    $('#micNote').textContent = 'Microphone devices could not be listed. Check Windows microphone access.';
  }
}
function hydrateSettings(value) {
  settings = value || {};
  refreshColabModels();
  scheduleWorkspaceSync();
  $('#speechDetail').value = settings.speechDetail || 'brief';
  $('#routeMode').value = settings.routeMode || 'auto';
  $('#requestTimeout').value = String(settings.timeoutSeconds ?? 0);
  $('#speakResponses').checked = settings.speakResponses !== false;
  $('#showReasoning').checked = settings.showReasoning === true;
  $('#launchAtStartup').checked = settings.launchAtStartup === true;
  $('#codexSandbox').value = settings.codexSandbox || 'workspace-write';
  $('#permissionBypass').checked = settings.permissionBypass === true;
  $('#recognitionMode').value = settings.recognitionMode || 'enhanced';
  $('#endSilence').value = String(settings.endSilenceMs || 1000);
  $('#wakeWordEnabled').checked = settings.wakeWordEnabled === true;
  $('#autoListenReplies').checked = settings.autoListenReplies !== false;
  $('#voiceEngine').value = settings.voiceEngine || 'kokoro';
  $('#kokoroVoice').value = settings.kokoroVoice || 'bm_george';
  $('#kokoroControls').hidden = $('#voiceEngine').value !== 'kokoro';
  $('#elevenLabsControls').hidden = $('#voiceEngine').value !== 'elevenlabs';
  $('#elevenLabsEnabled').checked = settings.elevenLabsEnabled === true;
  $('#elevenLabsModel').value = settings.elevenLabsModel || 'eleven_multilingual_v2';
  $('#elevenLabsSpeed').value = String(settings.elevenLabsSpeed || 0.92);
  $('#elevenLabsSpeedValue').textContent = `${Number($('#elevenLabsSpeed').value).toFixed(2)}×`;
  if (
    settings.elevenLabsVoiceId &&
    !Array.from($('#elevenLabsVoice').options).some((option) => option.value === settings.elevenLabsVoiceId)
  )
    $('#elevenLabsVoice').add(new Option(`Saved voice · ${settings.elevenLabsVoiceId}`, settings.elevenLabsVoiceId));
  $('#elevenLabsVoice').value = settings.elevenLabsVoiceId || '';
  renderModelList('codex');
  renderModelList('claude');
  refreshMicrophones();
}
async function loadSettings() {
  try {
    hydrateSettings(await window.atlas.getSettings());
    if (settings.wakeWordEnabled) startWakeListener();
  } catch (e) {
    toast('Could not load settings: ' + e.message);
  }
}
async function updateElevenKeyStatus() {
  try {
    $('#elevenLabsKeyStatus').textContent = (await window.atlas.elevenLabsKeyStatus())
      ? 'Encrypted key saved on this PC'
      : 'No key saved';
  } catch {
    $('#elevenLabsKeyStatus').textContent = 'Secure key storage unavailable';
  }
}
$('#saveElevenLabsKey').onclick = async () => {
  const key = $('#elevenLabsKey').value.trim();
  if (!key) {
    toast('Paste your ElevenLabs API key first.');
    return;
  }
  try {
    await window.atlas.saveElevenLabsKey(key);
    $('#elevenLabsKey').value = '';
    await updateElevenKeyStatus();
    toast('ElevenLabs key encrypted and saved');
    $('#loadElevenLabsVoices').click();
  } catch (e) {
    toast('Could not save ElevenLabs key: ' + e.message);
  }
};

$('#clearElevenLabsKey').onclick = async () => {
  if (!confirm('Remove the encrypted ElevenLabs key from this computer?')) return;
  try {
    await window.atlas.clearElevenLabsKey();
    await updateElevenKeyStatus();
    toast('Saved key removed');
  } catch (e) {
    toast(e.message);
  }
};

$('#loadElevenLabsVoices').onclick = async () => {
  const button = $('#loadElevenLabsVoices');
  button.disabled = true;
  button.textContent = 'Loading…';
  try {
    const voices = await window.atlas.getElevenLabsVoices(),
      select = $('#elevenLabsVoice');
    voices.sort((a, b) => {
      const rank = (v) => (/british/i.test(v.accent) ? 4 : 0) + (/male/i.test(v.gender) ? 1 : 0);
      return rank(b) - rank(a) || a.name.localeCompare(b.name);
    });
    const preferred =
        voices.find((v) => /british/i.test(v.accent) && /male/i.test(v.gender)) ||
        voices.find((v) => /british/i.test(v.accent)) ||
        voices[0],
      selected = settings.elevenLabsVoiceId || select.value || preferred?.id;
    select.replaceChildren(new Option('Choose a voice', ''));
    for (const voice of voices) {
      const detail = [voice.accent, voice.gender].filter(Boolean).join(' · ');
      select.add(new Option(detail ? `${voice.name} — ${detail}` : voice.name, voice.id));
    }
    select.value = voices.some((voice) => voice.id === selected) ? selected : '';
    if (selected && !select.value)
      (select.add(new Option(`Saved voice · ${selected}`, selected), 1), (select.value = selected));
    if (preferred && !settings.elevenLabsVoiceId)
      toast(`Voices loaded. Suggested: ${preferred.name}. British voices are listed first.`);
    else toast(`${voices.length} ElevenLabs voices loaded. British voices are listed first.`);
  } catch (e) {
    toast('Could not load ElevenLabs voices: ' + e.message);
  } finally {
    button.disabled = false;
    button.textContent = 'Load voices';
  }
};
$('#voiceEngine').addEventListener('change', (e) => {
  $('#kokoroControls').hidden = e.target.value !== 'kokoro';
  $('#elevenLabsControls').hidden = e.target.value !== 'elevenlabs';
});
$('#testKokoroVoice').onclick = async () => {
  const button = $('#testKokoroVoice');
  button.disabled = true;
  button.textContent = 'Preparing local voice…';
  try {
    const bytes = await timedVoice('kokoro', {
      voice: $('#kokoroVoice').value,
      text: 'Good evening. I am ATLAS, at your service. How may I assist you today?',
    });
    await playAudio(bytes, 'audio/wav');
  } catch (e) {
    toast('Local voice preview failed: ' + e.message);
  } finally {
    button.disabled = false;
    button.textContent = 'Preview local voice';
  }
};
window.atlas.onVoiceProgress((message) => {
  if ($('#voiceEngine').value === 'kokoro') toast(`Preparing local speech model · ${message}`);
});
$('#elevenLabsSpeed').addEventListener(
  'input',
  (e) => ($('#elevenLabsSpeedValue').textContent = `${Number(e.target.value).toFixed(2)}×`),
);
$('#testElevenLabsVoice').onclick = async () => {
  const voiceId = $('#elevenLabsVoice').value;
  if (!voiceId) {
    toast('Load and choose a voice first.');
    return;
  }
  try {
    settings = await window.atlas.saveSettings({
      ...settings,
      elevenLabsVoiceId: voiceId,
      elevenLabsModel: $('#elevenLabsModel').value,
      elevenLabsSpeed: Number($('#elevenLabsSpeed').value),
    });
    const bytes = await timedVoice('elevenlabs', {
      voiceId,
      text: 'Good evening. I am ATLAS, at your service. How may I assist you today?',
    });
    await playAudio(bytes);
  } catch (e) {
    toast('Voice preview failed: ' + e.message);
  }
};
async function refreshProviderAuth() {
  try {
    const result = await window.atlas.providerAuthStatus();
    for (const provider of ['codex', 'claude']) {
      const status = result[provider],
        state = $(`#${provider}AuthState`),
        detail = $(`#${provider}AuthDetail`),
        button = $(`#connect${provider === 'codex' ? 'Codex' : 'Claude'}`);
      state.textContent = status.loggedIn
        ? 'Connected'
        : status.installed === false
          ? 'Not installed'
          : status.status === 'error'
            ? 'Connection check failed'
            : 'Not signed in';
      state.className = `auth-state ${status.loggedIn ? 'connected' : 'disconnected'}`;
      detail.textContent = status.detail;
      button.dataset.installed = String(status.installed !== false);
      if (button.dataset.busy !== 'true') {
        button.textContent =
          provider === 'claude' && status.installed === false
            ? 'Install and sign in'
            : status.loggedIn
              ? 'Open terminal'
              : 'Sign in';
        button.disabled = false;
      }
    }
  } catch (error) {
    for (const id of ['codexAuthDetail', 'claudeAuthDetail'])
      $(`#${id}`).textContent = 'Could not check provider login.';
  }
}
async function connectProvider(provider, button) {
  if (button.dataset.busy === 'true') return;
  const label = provider === 'codex' ? 'Codex' : 'Claude Code';
  const connected = $('#' + provider + 'AuthState').textContent === 'Connected';
  const install = provider === 'claude' && button.dataset.installed === 'false';
  const message = $('#providerLoginMessage');
  button.dataset.busy = 'true';
  button.disabled = true;
  button.textContent = install ? 'Installing…' : 'Opening…';
  message.textContent = install
    ? 'Downloading and installing Claude Code from Anthropic. This can take several minutes. Sign-in will open when it finishes.'
    : 'Opening ' + label + ' sign-in…';
  try {
    const result = await window.atlas.providerLogin(provider, connected);
    message.textContent = result.alreadyConnected
      ? 'Opened PowerShell showing ' + label + ' account status.'
      : (install ? 'Claude Code installed. ' : '') +
        'Opened PowerShell for ' +
        label +
        ' sign-in. Follow its instructions.';
  } catch (error) {
    message.textContent = (error.message || 'Could not open sign-in.').replace(
      /^Error invoking remote method '[^']+': Error: /,
      '',
    );
  } finally {
    button.dataset.busy = 'false';
    button.disabled = false;
    button.textContent = connected ? 'Open terminal' : 'Sign in';
    await refreshProviderAuth();
  }
}

updateElevenKeyStatus();
$('#connectCodex').addEventListener('click', (e) => connectProvider('codex', e.currentTarget));
$('#connectClaude').addEventListener('click', (e) => connectProvider('claude', e.currentTarget));
window.addEventListener('focus', () => {
  if ($('#settingsDialog').open) refreshProviderAuth();
});
$('#settingsOpen').addEventListener('click', async () => {
  $('#settingsDialog').showModal();
  await Promise.all([refreshMicrophones(), refreshProviderAuth()]);
});
$('#settingsClose').addEventListener('click', () => $('#settingsDialog').close());
$('#settingsDialog').addEventListener('click', (e) => {
  if (e.target === $('#settingsDialog')) $('#settingsDialog').close();
});
$('#permissionBypass').addEventListener('change', (e) => {
  if (
    e.target.checked &&
    !confirm(
      'Enable provider permission bypass? This lets Claude Code skip its permission prompts. For Codex it also disables the sandbox, giving it broad computer access. Only enable this if you understand and trust every task you send.',
    )
  )
    e.target.checked = false;
});
function addModel(provider) {
  const input = $(`#${provider}ModelInput`),
    id = input.value.trim();
  if (!modelIdPattern.test(id)) {
    toast('Enter a valid model ID (letters, numbers, . _ : / -).');
    return;
  }
  const key = `${provider}Models`;
  settings[key] = [...new Set([...(settings[key] || []), id])];
  settings[`${provider}Model`] = id;
  renderModelList(provider);
  input.value = '';
}
function removeModel(provider) {
  const chosen = $(`#${provider}Model`).value;
  if (!chosen) return;
  const key = `${provider}Models`;
  settings[key] = (settings[key] || []).filter((id) => id !== chosen);
  if (settings[`${provider}Model`] === chosen) settings[`${provider}Model`] = '';
  renderModelList(provider);
}
$('#addCodexModel').onclick = () => addModel('codex');
$('#addClaudeModel').onclick = () => addModel('claude');
$('#removeCodexModel').onclick = () => removeModel('codex');
$('#removeClaudeModel').onclick = () => removeModel('claude');
$('#micSelect').addEventListener('change', (e) => {
  settings.voiceDeviceId = e.target.value;
});
if (navigator.mediaDevices?.addEventListener)
  navigator.mediaDevices.addEventListener('devicechange', refreshMicrophones);
$('#settingsSave').addEventListener('click', async () => {
  const voiceId = $('#elevenLabsVoice').value;
  if ($('#voiceEngine').value === 'elevenlabs' && $('#elevenLabsEnabled').checked && !voiceId) {
    toast('Choose an ElevenLabs voice before enabling it.');
    return;
  }
  const next = {
    ...settings,
    speechDetail: $('#speechDetail').value,
    routeMode: $('#routeMode').value,
    timeoutSeconds: Number($('#requestTimeout').value),
    speakResponses: $('#speakResponses').checked,
    showReasoning: $('#showReasoning').checked,
    launchAtStartup: $('#launchAtStartup').checked,
    voiceEngine: $('#voiceEngine').value,
    kokoroVoice: $('#kokoroVoice').value,
    codexSandbox: $('#codexSandbox').value,
    permissionBypass: $('#permissionBypass').checked,
    voiceDeviceId: $('#micSelect').value,
    recognitionMode: $('#recognitionMode').value,
    endSilenceMs: Number($('#endSilence').value),
    wakeWordEnabled: $('#wakeWordEnabled').checked,
    autoListenReplies: $('#autoListenReplies').checked,
    codexModels: settings.codexModels || [],
    claudeModels: settings.claudeModels || [],
    codexModel: $('#codexModel').value,
    claudeModel: $('#claudeModel').value,
    elevenLabsEnabled: $('#elevenLabsEnabled').checked,
    elevenLabsVoiceId: voiceId,
    elevenLabsModel: $('#elevenLabsModel').value,
    elevenLabsSpeed: Number($('#elevenLabsSpeed').value),
  };
  $('#settingsSave').disabled = true;
  try {
    settings = await window.atlas.saveSettings(next);
    hydrateSettings(settings);
    if (settings.wakeWordEnabled) startWakeListener();
    else stopWakeListener();
    $('#settingsSaved').textContent = 'Saved on this computer';
    $('#settingsDialog').close();
    toast('Settings saved');
  } catch (e) {
    toast('Could not save settings: ' + e.message);
  } finally {
    $('#settingsSave').disabled = false;
  }
});
function appendDesktopSessionButtons(panel, transcript, item) {
  const sessions =
    item.provider === 'atlas'
      ? Object.entries(transcript.sessions || {}).filter(([, id]) => id)
      : transcript.sessionId
        ? [[item.provider, transcript.sessionId]]
        : [];
  if (!sessions.length) return;
  const actions = document.createElement('div');
  actions.className = 'history-actions';
  for (const [provider, sessionId] of sessions) {
    const button = document.createElement('button');
    button.className = 'quiet-button';
    button.textContent = provider === 'codex' ? 'Open in Codex app' : 'Open in Claude Desktop';
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        await window.atlas.openProviderSession({ provider, sessionId, cwd: transcript.cwd });
        toast(
          provider === 'codex'
            ? 'Opened Codex session link.'
            : 'Asked Claude Code to open this session in Claude Desktop.',
        );
      } catch (error) {
        toast(`Could not open session: ${error.message}`);
      } finally {
        button.disabled = false;
      }
    });
    actions.append(button);
  }
  panel.append(actions);
}
async function refreshHistory() {
  const box = $('#historyItems');
  box.replaceChildren();
  try {
    historyCache = await window.atlas.historyList();
    renderHistoryList();
  } catch (e) {
    box.textContent = 'Could not read conversation history: ' + e.message;
  }
}
async function restoreActiveConversation() {
  try {
    if (!conversationId && localStorage.getItem('atlas.newConversation') !== '1') {
      const latest = await window.atlas.latestConversation();
      if (latest?.id) {
        conversationId = latest.id;
        localStorage.setItem('atlas.activeConversation', conversationId);
      }
    }
    if (!conversationId) return;
    const saved = await window.atlas.historyRead({ provider: 'atlas', id: conversationId });
    if (!saved?.turns?.length) return;
    if (window.atlasAssistant) {
      await window.atlasAssistant.open(saved.id, { quiet: true });
      return;
    }
    if (saved.cwd) setPath(saved.cwd);
    const lastUser = saved.turns.findLast((turn) => turn.role === 'user'),
      lastAnswer = saved.turns.findLast((turn) => turn.role === 'assistant');
    userTurn.textContent = lastUser?.content || '';
    userTurn.attachmentFiles = lastUser?.attachments || [];
    window.atlasWorkspace?.messageAttachments(userTurn, userTurn.attachmentFiles);
    userTurn.hidden = !lastUser;
    renderAnswer(lastAnswer?.content || '');
    response.classList.add('show');
    $('#greeting').textContent = 'Welcome back.';
    $('#sub').textContent = 'CONTINUING YOUR SAVED CONVERSATION';
  } catch {
    conversationId = '';
    localStorage.removeItem('atlas.activeConversation');
  }
}
restoreActiveConversation();
function renderHistoryList() {
  const box = $('#historyItems'),
    query = $('#historySearch').value.trim().toLowerCase();
  box.replaceChildren();
  const items = historyCache.filter((item) =>
    `${item.provider} ${item.title} ${item.cwd} ${item.searchText || ''}`.toLowerCase().includes(query),
  );
  if (!items.length) {
    const empty = document.createElement('div');
    empty.className = 'history-empty';
    empty.textContent = query ? 'No matching conversations.' : 'No saved conversations were found.';
    box.append(empty);
    return;
  }
  for (const item of items) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'history-item';
    const title = document.createElement('span');
    title.textContent = item.title || 'Untitled conversation';
    const meta = document.createElement('small');
    meta.textContent = `${item.provider.toUpperCase()} · ${new Date(item.updatedAt).toLocaleString()} · ${item.turnCount} messages`;
    button.append(title, meta);
    button.addEventListener('click', () => openHistoryItem(item, button));
    box.append(button);
  }
}
async function openHistoryItem(item, button) {
  document.querySelectorAll('.history-item.selected').forEach((node) => node.classList.remove('selected'));
  button.classList.add('selected');
  const panel = $('#historyPreview');
  panel.replaceChildren();
  try {
    const transcript = await window.atlas.historyRead({ provider: item.provider, id: item.id });
    const title = document.createElement('h3');
    title.textContent = transcript.title || item.title || 'Conversation';
    const meta = document.createElement('div');
    meta.className = 'history-meta';
    meta.textContent = `${item.provider.toUpperCase()} · ${new Date(transcript.updatedAt || item.updatedAt).toLocaleString()} · Working folder: ${transcript.cwd || 'not recorded'}`;
    const pre = document.createElement('pre');
    pre.className = 'history-transcript';
    pre.textContent = transcript.turns.map((turn) => `${turn.role.toUpperCase()}\n${turn.content}`).join('\n\n');
    panel.append(title, meta, pre);
    appendDesktopSessionButtons(panel, transcript, item);
    if (item.provider === 'atlas') {
      const cont = document.createElement('button');
      cont.className = 'quiet-button';
      cont.textContent = 'Continue this conversation';
      cont.addEventListener('click', () => {
        clearFollowup();
        cancelRecording();
        stopSpeaking();
        cancelStreamPaint();
        foregroundRequest = '';
        streamRequestId = '';
        lastSpokenAnswer = '';
        $('#readFullAnswer').hidden = true;
        userTurn.hidden = true;
        if (transcript.cwd) setPath(transcript.cwd);
        conversationId = transcript.id;
        localStorage.setItem('atlas.activeConversation', conversationId);
        $('#output').textContent = transcript.turns
          .slice(-8)
          .map((turn) => `${turn.role.toUpperCase()} · ${turn.content}`)
          .join('\n\n');
        $('#response').classList.add('show');
        $('#greeting').textContent = 'Welcome back.';
        $('#sub').textContent = 'CONTINUING SAVED ATLAS CONVERSATION';
        $('#historyDialog').close();
        $('#prompt').focus();
      });
      panel.append(cont);
    } else {
      const note = document.createElement('div');
      note.className = 'history-empty';
      note.textContent =
        'Imported as a local, read-only transcript. Open its provider session above to continue in the desktop app.';
      panel.append(note);
    }
  } catch (e) {
    const error = document.createElement('div');
    error.className = 'history-empty';
    error.textContent = e.message;
    panel.append(error);
  }
}
$('#historyOpen').addEventListener('click', async () => {
  $('#historyDialog').showModal();
  await refreshHistory();
});
$('#historyClose').addEventListener('click', () => $('#historyDialog').close());
$('#historyDialog').addEventListener('click', (e) => {
  if (e.target === $('#historyDialog')) $('#historyDialog').close();
});
$('#historySearch').addEventListener('input', renderHistoryList);
$('#newChat').addEventListener('click', () => {
  clearFollowup();
  cancelRecording();
  stopSpeaking();
  cancelStreamPaint();
  foregroundRequest = '';
  streamRequestId = '';
  lastSpokenAnswer = '';
  $('#readFullAnswer').hidden = true;
  userTurn.hidden = true;
  conversationId = '';
  localStorage.removeItem('atlas.activeConversation');
  localStorage.setItem('atlas.newConversation', '1');
  $('#output').textContent = '';
  $('#response').classList.remove('show');
  $('#prompt').value = '';
  sizeAssistantComposer();
  $('#greeting').textContent = 'Ready when you are.';
  $('#sub').textContent = 'Speak or type a message to begin';
  $('#historyDialog').close();
  $('#prompt').focus();
});
loadSettings();
function setPath(p) {
  if (!p) return;
  cwd = p;
  if ($('#colabFolder')) $('#colabFolder').textContent = p;
  $('#folder').textContent = 'WORKING DIRECTORY · ' + p;
  $('#workspaceLabel').textContent = p.split(/[\\/]/).filter(Boolean).pop() || p;
  $('#workspacePath').textContent = p;
  try {
    localStorage.setItem('atlas.cwd', p);
  } catch {}
}
$('#setFolder').onclick = async () => {
  try {
    const p = await window.atlas.pickFolder();
    if (p) setPath(p);
  } catch (e) {
    toast(e.message);
  }
};
try {
  const stored = localStorage.getItem('atlas.cwd');
  if (stored) setPath(stored);
  else
    window.atlas
      .home()
      .then(setPath)
      .catch(() => {});
} catch {}

let foregroundRequest = '',
  jobList = [];
async function sendMessage(prompt, options = {}) {
  if (!prompt || !cwd) return;
  if (/^(?:tell me more|read (?:the )?(?:full answer|full reply|details))[.!? ]*$/i.test(prompt) && lastSpokenAnswer) {
    $('#prompt').value = '';
    sizeAssistantComposer();
    await readFullAnswer();
    return;
  }
  const attached = options.resumeJobId
    ? { request: {}, files: [] }
    : window.atlasWorkspace?.takeAttachments('assistant') || { request: {}, files: [] };
  clearFollowup();
  cancelRecording();
  stopWakeListener();
  userTurn.textContent = prompt;
  userTurn.attachmentFiles = attached.files;
  window.atlasWorkspace?.messageAttachments(userTurn, attached.files);
  userTurn.hidden = false;
  beginResponseStream();
  const requestId = streamRequestId;
  foregroundRequest = requestId;
  window.dispatchEvent(new Event('atlas-assistant-task'));
  startLatency(requestId);
  const currentConversation = options.conversationId || conversationId || crypto.randomUUID();
  conversationId = currentConversation;
  localStorage.setItem('atlas.activeConversation', conversationId);
  $('#prompt').value = '';
  sizeAssistantComposer();
  $('#sessionStatus').textContent = 'PROCESSING';
  $('#greeting').textContent = 'On it.';
  sub.textContent = 'WORKING · YOU CAN KEEP TALKING';
  orb.classList.add('thinking');
  response.classList.add('show');
  response.classList.remove('error');
  output.textContent = 'Working…';
  $('#followup').hidden = true;
  try {
    const d = await window.atlas.chat({
      cwd: options.cwd || cwd,
      prompt,
      conversationId: currentConversation,
      requestId,
      resumeJobId: options.resumeJobId,
      effort: window.atlasWorkspace?.context('assistant').effort,
      ...attached.request,
    });
    if (foregroundRequest !== requestId) return;
    markLatency(requestId, 'providerMs', performance.now() - latency.started);
    renderAnswer(d.output || '(No response text)');
    $('#coreEngine').textContent = (d.provider || '').toUpperCase();
    $('#sessionStatus').textContent = 'STANDBY';
    sub.textContent = 'READY';
    const hasQuestion = showFollowupOptions(d.output, requestId),
      question = pendingFollowup;
    await finishResponseStream(d.output);
    if (
      foregroundRequest === requestId &&
      hasQuestion &&
      pendingFollowup === question &&
      !question.listened &&
      settings.autoListenReplies &&
      !listening
    ) {
      question.listened = true;
      void startRecording({ purpose: 'followup', timeoutMs: 12000 });
    }
  } catch (error) {
    if (foregroundRequest === requestId) {
      clearFollowup();
      stopSpeaking();
      cancelStreamPaint();
      output.textContent = error.message;
      response.classList.add('error');
      $('#sessionStatus').textContent = 'ATTENTION';
    }
  } finally {
    if (foregroundRequest === requestId) {
      orb.classList.remove('thinking');
      $('#greeting').textContent = 'At your service.';
      if (settings.wakeWordEnabled && !listening) void startWakeListener();
    }
  }
}
$('#form').onsubmit = (e) => {
  e.preventDefault();
  const prompt = $('#prompt').value.trim();
  if (!prompt) return;
  if (!cwd) {
    toast('Choose a working folder first');
    return;
  }
  if (jobList.some((j) => j.status === 'running' && j.conversationId === conversationId)) {
    conversationId = '';
    toast('Opened a separate conversation while your task continues.');
  }
  void sendMessage(prompt);
};
function sizeAssistantComposer() {
  const field = $('#prompt');
  field.style.height = 'auto';
  field.style.height = Math.min(180, Math.max(54, field.scrollHeight)) + 'px';
}
$('#prompt').addEventListener('input', sizeAssistantComposer);
$('#prompt').addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229) {
    event.preventDefault();
    $('#form').requestSubmit();
  }
});

const jobsPanel = document.createElement('details');
jobsPanel.className = 'assistant-panel';
jobsPanel.innerHTML = '<summary>Tasks</summary><div id="jobItems"></div>';
$('#form').after(jobsPanel);
function renderJobs(items) {
  jobList = items;
  scheduleWorkspaceSync();
  if (document.activeElement?.dataset.jobDirection) return;
  const box = $('#jobItems');
  box.replaceChildren();
  for (const job of items.slice().reverse()) {
    const row = document.createElement('div');
    row.className = 'assistant-row';
    const label = document.createElement('div');
    label.textContent = job.prompt + ' · ' + job.status + ' · ' + (job.statusText || '');
    row.append(label);
    function button(text, action) {
      const b = document.createElement('button');
      b.className = 'quiet-button';
      b.textContent = text;
      b.onclick = action;
      row.append(b);
    }
    if (job.status === 'running') {
      button('Pause', () => window.atlas.jobs({ action: 'stop', id: job.id, pause: true }));
      button('Cancel', () => window.atlas.jobs({ action: 'stop', id: job.id }));
    }
    if (job.status === 'paused') {
      button(job.collaboration ? 'Open Colab to resume' : 'Resume', () =>
        job.collaboration
          ? window.atlasColab.selectChat(job.colabChatId)
          : sendMessage(
              'Continue the interrupted task. Check what already completed before repeating any action. Original task: ' +
                job.prompt,
              { conversationId: job.conversationId, cwd: job.cwd, resumeJobId: job.id },
            ),
      );
    }
    if (!job.collaboration && ['running', 'paused'].includes(job.status)) {
      const direction = document.createElement('input');
      direction.placeholder = 'Change direction…';
      direction.dataset.jobDirection = job.id;
      direction.onblur = () => setTimeout(() => renderJobs(jobList), 200);
      direction.setAttribute('aria-label', 'New instructions for task');
      row.append(direction);
      button('Apply update', async () => {
        const text = direction.value.trim();
        if (!text) return;
        try {
          if (job.status === 'running') {
            await window.atlas.jobs({ action: 'stop', id: job.id, pause: true });
            for (let i = 0; i < 50; i++) {
              const items = await window.atlas.jobs();
              if (items.find((j) => j.id === job.id)?.status !== 'running') break;
              await new Promise((r) => setTimeout(r, 100));
            }
            if ((await window.atlas.jobs()).find((j) => j.id === job.id)?.status === 'running')
              throw Error('Still stopping. Try again in a moment.');
          }
          void sendMessage(
            'Continue the original task with this update: ' +
              text +
              '\nOriginal task: ' +
              job.prompt +
              '\nInspect existing progress before repeating actions.',
            { conversationId: job.conversationId, cwd: job.cwd, resumeJobId: job.id },
          );
        } catch (e) {
          toast(e.message);
        }
      });
    }
    if (job.workspaceId && job.status !== 'running')
      button('Review changes', () => window.atlasWorkspace.review(job.workspaceId));
    button('Review', () => {
      if (window.atlasAssistant && job.conversationId) {
        void window.atlasAssistant.open(job.conversationId, { job });
        return;
      }
      output.textContent =
        'TASK: ' +
        job.prompt +
        '\n\nSTATUS: ' +
        job.status +
        '\n\nREPORTED ACTIVITY\n' +
        (job.events || [])
          .map(
            (e) =>
              new Date(e.at).toLocaleTimeString() +
              ' · ' +
              (e.kind === 'reasoning'
                ? (e.provider === 'claude' ? 'Claude thinking' : 'Codex reasoning') + ' summary (model-reported)'
                : e.kind) +
              ({ chat: ' (approved for this chat)', screen: ' (allowed by screen control)', once: ' (approved once)' }[
                e.approvedBy
              ] || '') +
              ' · ' +
              e.text,
          )
          .join('\n') +
        '\n\nRESULT\n' +
        (job.result?.output || job.error || job.statusText);
      response.classList.add('show');
    });
    box.append(row);
  }
}
window.atlas.onJobs((patch) => {
  const items = new Map(jobList.map((job) => [job.id, job]));
  for (const id of patch.removed) items.delete(id);
  for (const job of patch.upsert) items.set(job.id, job);
  renderJobs([...items.values()]);
});
window.atlas.jobs().then(renderJobs);

function addActivity(title, detail) {
  const row = document.createElement('div');
  row.className = 'logline';
  const b = document.createElement('b');
  b.textContent = title;
  const t = document.createElement('time');
  t.textContent = (detail || '').replace(/\s+/g, ' ').slice(0, 72) || new Date().toLocaleTimeString();
  row.append(b, t);
  $('#activity').prepend(row);
  while ($('#activity').children.length > 4) $('#activity').lastElementChild.remove();
}
if ('speechSynthesis' in window) {
  speechSynthesis.getVoices();
  speechSynthesis.onvoiceschanged = () => {
    $('#speechStatus').textContent = speechSynthesis.getVoices().length ? 'AVAILABLE' : 'UNAVAILABLE';
  };
}

let streamPaintFrame = 0;
function cancelStreamPaint() {
  if (streamPaintFrame) cancelAnimationFrame(streamPaintFrame);
  streamPaintFrame = 0;
}
function scheduleStreamPaint() {
  if (streamPaintFrame) return;
  const id = streamRequestId;
  streamPaintFrame = requestAnimationFrame(() => {
    streamPaintFrame = 0;
    if (id === streamRequestId) output.textContent = streamText;
  });
}
let pendingQuestion = '',
  streamRequestId = '',
  streamText = '',
  streamPending = '',
  speechQueue = Promise.resolve(),
  speechGeneration = 0,
  speechStopped = false,
  speechCount = 0;

window.atlas.onResponseText(({ requestId, text, reset }) => {
  if (requestId !== streamRequestId) return;
  if (reset) {
    cancelStreamPaint();
    stopSpeaking();
    speechStopped = false;
    streamText = '';
    streamPending = '';
    speechCount = 0;
    briefSentences = 0;
    briefSpoken = '';
    speechQueue = Promise.resolve();
    speechBatch = newSpeechBatch();
    return;
  }
  if (latency && latency.firstTextMs == null)
    markLatency(requestId, 'firstTextMs', performance.now() - latency.started);
  streamText += text;
  streamPending += text;
  scheduleStreamPaint();
  flushSpeech();
});

let interruptionMic = null,
  interruptionOpening = false;
function stopInterruptionMonitor() {
  const m = interruptionMic;
  interruptionMic = null;
  if (!m) return;
  m.stream.getTracks().forEach((t) => t.stop());
  m.node.disconnect();
  m.source.disconnect();
  void m.ctx.close();
}
async function startInterruptionMonitor() {
  if (interruptionMic || interruptionOpening || listening) return;
  interruptionOpening = true;
  try {
    if (wakeListening) stopWakeListener();
    const audio = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
    if (settings.voiceDeviceId) audio.deviceId = { exact: settings.voiceDeviceId };
    const generation = speechGeneration;
    const s = await navigator.mediaDevices.getUserMedia({ audio });
    if (generation !== speechGeneration || listening) {
      s.getTracks().forEach((t) => t.stop());
      return;
    }
    const ctx = new AudioContext(),
      src = ctx.createMediaStreamSource(s),
      node = ctx.createScriptProcessor(2048, 1, 1);
    interruptionMic = { stream: s, ctx, node, source: src };
    let since = 0,
      ring = [];
    node.onaudioprocess = (e) => {
      const data = new Float32Array(e.inputBuffer.getChannelData(0));
      ring.push(data);
      while (ring.length > Math.ceil((ctx.sampleRate / 2048) * 0.75)) ring.shift();
      let sum = 0;
      for (let i = 0; i < data.length; i += 4) sum += data[i] * data[i];
      const level = Math.sqrt(sum / (data.length / 4)),
        now = Date.now();
      if (level > 0.035) {
        since ||= now;
      } else since = 0;
      if (since && now - since > 280) {
        const preRoll = joinAudio(ring),
          sampleRate = ctx.sampleRate;
        stopSpeaking();
        void startRecording({ purpose: 'interrupt', preRoll, sampleRate });
      }
    };
    src.connect(node);
    node.connect(ctx.destination);
  } catch {
    /* Manual stop stays available when microphone is unavailable. */
  } finally {
    interruptionOpening = false;
  }
}
const stopButton = document.createElement('button');
stopButton.type = 'button';
stopButton.className = 'quiet-button';
stopButton.textContent = 'Stop speaking';
stopButton.title = 'Stop speech (Escape)';
stopButton.onclick = () => {
  stopSpeaking();
  sub.textContent = 'SPEECH STOPPED';
};
$('#form').after(stopButton);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') stopSpeaking();
});

const memoryPanel = document.createElement('details');
memoryPanel.className = 'assistant-panel';
memoryPanel.innerHTML =
  '<summary>Memory</summary><p>Saved locally. Relevant memories accompany your requests. Edit or delete anything here.</p><select id="memoryCategory" aria-label="Memory category"><option value="preference">Preference</option><option value="project">Project</option><option value="decision">Decision</option><option value="task">Unfinished task</option></select><textarea id="memoryText" maxlength="2000" placeholder="What should ATLAS remember?" aria-label="Memory text"></textarea><button type="button" class="quiet-button" id="memorySave">Save memory</button><button type="button" class="quiet-button" id="memoryClear">Clear editor</button><div id="memoryItems"></div>';
jobsPanel.after(memoryPanel);
let editingMemory = '';
async function refreshMemory() {
  try {
    const items = await window.atlas.memory();
    const box = $('#memoryItems');
    box.replaceChildren();
    for (const item of items) {
      const row = document.createElement('div');
      row.className = 'assistant-row';
      const text = document.createElement('p');
      text.textContent = item.category + ' · ' + item.text;
      const edit = document.createElement('button');
      edit.className = 'quiet-button';
      edit.textContent = 'Edit';
      edit.onclick = () => {
        editingMemory = item.id;
        $('#memoryText').value = item.text;
        $('#memoryCategory').value = item.category;
      };
      const del = document.createElement('button');
      del.className = 'quiet-button';
      del.textContent = 'Delete';
      del.onclick = async () => {
        await window.atlas.memory({ action: 'delete', item: { id: item.id } });
        if (editingMemory === item.id) $('#memoryClear').click();
        await refreshMemory();
      };
      row.append(text, edit, del);
      box.append(row);
    }
  } catch (e) {
    toast(e.message);
  }
}
$('#memorySave').onclick = async () => {
  try {
    await window.atlas.memory({
      action: 'save',
      item: { id: editingMemory || undefined, text: $('#memoryText').value, category: $('#memoryCategory').value },
    });
    $('#memoryClear').click();
    await refreshMemory();
    toast('Memory saved');
  } catch (e) {
    toast(e.message);
  }
};
$('#memoryClear').onclick = () => {
  editingMemory = '';
  $('#memoryText').value = '';
};
memoryPanel.addEventListener('toggle', () => {
  if (memoryPanel.open) void refreshMemory();
});

const agendaPanel = document.createElement('details');
agendaPanel.className = 'assistant-panel';
agendaPanel.innerHTML =
  '<summary>Agenda & reminders</summary><p>Reminders run while ATLAS is open. Overdue reminders appear when you reopen it.</p><input id="reminderTitle" maxlength="300" placeholder="Reminder" aria-label="Reminder title"><input id="reminderDate" type="datetime-local" aria-label="Reminder time"><select id="reminderRepeat" aria-label="Repeat reminder"><option value="0">Once</option><option value="60">Hourly</option><option value="1440">Daily</option><option value="10080">Weekly</option></select><button type="button" class="quiet-button" id="reminderSave">Add reminder</button><div id="agendaItems"></div>';
memoryPanel.after(agendaPanel);
async function refreshAgenda() {
  try {
    const items = await window.atlas.reminders();
    const box = $('#agendaItems');
    box.replaceChildren();
    for (const item of items.filter((r) => !r.acknowledged).sort((a, b) => a.dueAt - b.dueAt)) {
      const row = document.createElement('div');
      row.className = 'assistant-row';
      const text = document.createElement('p');
      text.textContent =
        item.title +
        ' · ' +
        new Date(item.dueAt).toLocaleString() +
        (item.repeatMinutes ? ' · recurring' : '') +
        (item.firedAt ? ' · DUE' : '');
      const done = document.createElement('button');
      done.className = 'quiet-button';
      done.textContent = item.repeatMinutes ? 'Remove routine' : 'Done';
      done.onclick = async () => {
        try {
          await window.atlas.reminders({ action: item.repeatMinutes ? 'delete' : 'done', item: { id: item.id } });
          await refreshAgenda();
        } catch (e) {
          toast(e.message);
        }
      };
      const del = document.createElement('button');
      del.className = 'quiet-button';
      del.textContent = 'Delete';
      del.onclick = async () => {
        await window.atlas.reminders({ action: 'delete', item: { id: item.id } });
        await refreshAgenda();
      };
      row.append(text, done, del);
      box.append(row);
    }
    if (!box.childElementCount) box.textContent = 'No upcoming reminders.';
  } catch (e) {
    toast(e.message);
  }
}
$('#reminderSave').onclick = async () => {
  try {
    await window.atlas.reminders({
      action: 'save',
      item: {
        title: $('#reminderTitle').value,
        dueAt: new Date($('#reminderDate').value).getTime(),
        repeatMinutes: Number($('#reminderRepeat').value),
      },
    });
    $('#reminderTitle').value = '';
    await refreshAgenda();
    toast('Reminder saved');
  } catch (e) {
    toast(e.message);
  }
};
agendaPanel.addEventListener('toggle', () => {
  if (agendaPanel.open) void refreshAgenda();
});
window.atlas.onReminder((item) => {
  toast('Reminder: ' + item.title);
  agendaPanel.open = true;
  void refreshAgenda();
});

let latency = null,
  pendingVoiceMetrics = null,
  latencyHistory = [];
try {
  latencyHistory = JSON.parse(localStorage.getItem('atlas.latency') || '[]');
} catch {}
const latencyPanel = document.createElement('details');
latencyPanel.className = 'assistant-panel';
latencyPanel.innerHTML =
  '<summary>Response timing</summary><p>Measured locally in milliseconds. A blank stage has not occurred or does not apply.</p><pre id="latencyValues"></pre><button type="button" id="latencyClear" class="quiet-button">Clear measurements</button>';
agendaPanel.after(latencyPanel);
function startLatency(id) {
  latency = { id, at: Date.now(), started: performance.now(), ...pendingVoiceMetrics };
  pendingVoiceMetrics = null;
  renderLatency();
}
function markLatency(id, key, value) {
  if (latency?.id !== id) return;
  latency[key] = Math.round(value);
  renderLatency();
}
function markFirstAudio() {
  if (latency && latency.firstAudioMs == null)
    markLatency(latency.id, 'firstAudioMs', performance.now() - latency.started);
}
async function timedTranscription(wav) {
  const start = performance.now();
  try {
    return await window.atlas.transcribe(wav);
  } finally {
    pendingVoiceMetrics ||= {};
    pendingVoiceMetrics.transcriptionMs = Math.round(performance.now() - start);
  }
}
async function timedVoice(engine, request) {
  const start = performance.now(),
    id = latency?.id;
  try {
    return await (engine === 'kokoro' ? window.atlas.kokoroSpeak(request) : window.atlas.elevenLabsSpeak(request));
  } finally {
    if (latency?.id === id) {
      latency.synthesisMs = (latency.synthesisMs || 0) + Math.round(performance.now() - start);
      renderLatency();
    }
  }
}
function renderLatency() {
  if (!latency) return;
  latencyHistory = latencyHistory.filter((x) => x.id !== latency.id);
  latencyHistory.push({ ...latency });
  latencyHistory = latencyHistory.slice(-30);
  localStorage.setItem('atlas.latency', JSON.stringify(latencyHistory));
  const labels = {
    endSilenceMs: 'Silence before sending',
    transcriptionMs: 'Transcription',
    firstTextMs: 'Send → first model text',
    providerMs: 'Send → model completion',
    synthesisMs: 'Total speech generation',
    firstAudioMs: 'Send → first audio',
  };
  $('#latencyValues').textContent =
    Object.entries(labels)
      .map(([key, label]) => label + ': ' + (latency[key] == null ? '—' : latency[key] + ' ms'))
      .join('\n') +
    '\n\nRecent requests: ' +
    latencyHistory.length;
}
$('#latencyClear').onclick = () => {
  latency = null;
  latencyHistory = [];
  localStorage.removeItem('atlas.latency');
  $('#latencyValues').textContent = 'Measurements cleared';
};
if (latencyHistory.length) {
  latency = latencyHistory.at(-1);
  renderLatency();
}

// A bounded audio pipeline: prepare the next chunk while the current one plays.
let speechBatch = null,
  activePlaybackCancel = null,
  streamFlushTimer = null;
function cleanSpeech(text) {
  return String(text || '')
    .replace(/```[\s\S]*?(?:```|$)/g, ' code block omitted ')
    .replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/g, '$1')
    .replace(/https?:\/\/\S+/g, 'link')
    .replace(/[`*_#>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function splitSpeechText(text, limit = 120) {
  const parts = [];
  let rest = cleanSpeech(text);
  while (rest.length > limit) {
    let cut = rest.lastIndexOf(' ', limit);
    if (cut < 25) cut = limit;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}
function setSpeaking(active) {
  orb.classList.toggle('speaking', active);
  if (active) {
    markFirstAudio();
    $('#sessionStatus').textContent = 'SPEAKING';
    void startInterruptionMonitor();
  } else {
    stopInterruptionMonitor();
    if ($('#sessionStatus').textContent === 'SPEAKING')
      $('#sessionStatus').textContent = orb.classList.contains('thinking') ? 'PROCESSING' : 'STANDBY';
  }
}
function playAudioAndWait(encoded, type = 'audio/wav') {
  return new Promise((resolve, reject) => {
    if (typeof encoded !== 'string' || !encoded.length) {
      reject(Error('No audio returned'));
      return;
    }
    const binary = atob(encoded),
      bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type })),
      player = new Audio(url);
    elevenPlayer = player;
    let finished = false;
    const done = (error) => {
      if (finished) return;
      finished = true;
      player.pause();
      URL.revokeObjectURL(url);
      if (elevenPlayer === player) {
        elevenPlayer = null;
        setSpeaking(false);
      }
      if (activePlaybackCancel === cancel) activePlaybackCancel = null;
      error ? reject(error) : resolve();
    };
    const cancel = () => done();
    activePlaybackCancel = cancel;
    player.onplaying = () => setSpeaking(true);
    player.onended = () => done();
    player.onerror = () => done(Error('Audio playback failed'));
    player.play().catch(done);
  });
}
function playAudio(encoded, type = 'audio/mpeg') {
  return playAudioAndWait(encoded, type);
}
function speakWindows(text) {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) {
      resolve();
      return;
    }
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1;
    u.pitch = 0.92;
    const voices = speechSynthesis.getVoices();
    u.voice = voices.find((v) => v.lang === 'en-GB') || voices.find((v) => /^en/.test(v.lang));
    let ended = false;
    const done = () => {
      if (ended) return;
      ended = true;
      setSpeaking(false);
      if (activePlaybackCancel === cancel) activePlaybackCancel = null;
      resolve();
    };
    const cancel = () => {
      speechSynthesis.cancel();
      done();
    };
    activePlaybackCancel = cancel;
    u.onstart = () => setSpeaking(true);
    u.onend = done;
    u.onerror = done;
    speechSynthesis.speak(u);
  });
}
function stopSpeaking() {
  void window.atlas.cancelSpeech().catch(() => {});
  speechGeneration++;
  speechStopped = true;
  clearTimeout(streamFlushTimer);
  if (speechBatch) {
    speechBatch.stopped = true;
    speechBatch.jobs = [];
    speechBatch.resolve?.();
  }
  activePlaybackCancel?.();
  speechSynthesis?.cancel();
  stopInterruptionMonitor();
  orb.classList.remove('speaking');
  scheduleWorkspaceSync();
}
function newSpeechBatch() {
  return {
    generation: speechGeneration,
    jobs: [],
    running: false,
    stopped: false,
    done: Promise.resolve(),
    resolve: null,
  };
}
async function prepareSpeech(text) {
  const engine = settings.voiceEngine || 'kokoro';
  if (engine === 'windows') return { text };
  if (engine === 'elevenlabs' && settings.elevenLabsEnabled && settings.elevenLabsVoiceId)
    return { bytes: await timedVoice('elevenlabs', { text, voiceId: settings.elevenLabsVoiceId }), type: 'audio/mpeg' };
  return { bytes: await timedVoice('kokoro', { text, voice: settings.kokoroVoice || 'bm_george' }), type: 'audio/wav' };
}
function prefetchSpeech(batch) {
  if (batch.stopped) return;
  for (const job of batch.jobs.slice(0, 2))
    if (!job.prepared)
      job.prepared = prepareSpeech(job.text).then(
        (value) => ({ value }),
        (error) => ({ error }),
      );
}
function pumpSpeech(batch) {
  if (batch.running || batch.stopped) return;
  batch.running = true;
  scheduleWorkspaceSync();
  batch.done = new Promise((resolve) => (batch.resolve = resolve));
  speechQueue = batch.done;
  void (async () => {
    try {
      while (batch.jobs.length && !batch.stopped) {
        prefetchSpeech(batch);
        const job = batch.jobs.shift(),
          prepared = await job.prepared;
        if (batch.stopped) break;
        prefetchSpeech(batch);
        if (prepared.error) {
          toast('Local speech unavailable; using Windows voice.');
          await speakWindows(job.text);
        } else if (prepared.value.bytes) await playAudioAndWait(prepared.value.bytes, prepared.value.type);
        else await speakWindows(job.text);
      }
    } catch (error) {
      if (!batch.stopped) toast(error.message);
    } finally {
      batch.running = false;
      scheduleWorkspaceSync();
      batch.resolve?.();
    }
  })();
}
function queueSpeech(text) {
  if (!settings.speakResponses || speechStopped || speechCount >= 12000) return;
  const clean = cleanSpeech(text).slice(0, 12000 - speechCount);
  if (!clean) return;
  speechBatch ||= newSpeechBatch();
  const limit = speechCount === 0 ? 80 : 130;
  speechCount += clean.length;
  for (const part of splitSpeechText(clean, limit)) speechBatch.jobs.push({ text: part, prepared: null });
  prefetchSpeech(speechBatch);
  pumpSpeech(speechBatch);
}
async function speak(text) {
  stopSpeaking();
  speechStopped = false;
  speechCount = 0;
  speechBatch = newSpeechBatch();
  queueSpeech(text);
  await speechQueue;
}
function beginResponseStream() {
  cancelStreamPaint();
  briefSentences = 0;
  briefSpoken = '';
  lastSpokenAnswer = '';
  $('#readFullAnswer').hidden = true;
  stopSpeaking();
  speechStopped = false;
  streamRequestId = crypto.randomUUID();
  streamText = '';
  streamPending = '';
  speechQueue = Promise.resolve();
  speechCount = 0;
  speechBatch = newSpeechBatch();
}
function flushSpeech(final = false) {
  clearTimeout(streamFlushTimer);
  const fence = String.fromCharCode(96, 96, 96);
  if (streamPending.includes(fence)) {
    if (!final) return;
    streamPending = streamPending.replace(/```[\s\S]*?(?:```|$)/g, ' code block omitted ');
  }
  let match;
  while ((match = streamPending.match(/^([\s\S]*?[.!?])(?:\s+|$)/)) && match[1].length > 1) {
    queueResponseSpeech(match[1]);
    streamPending = streamPending.slice(match[0].length);
  }
  if (final) {
    queueResponseSpeech(streamPending);
    streamPending = '';
    return;
  }
  // Start a long sentence at a natural clause boundary instead of waiting for its end.
  if (settings.speechDetail === 'full' && streamPending.length >= 100 && !streamPending.includes('](')) {
    const prefix = streamPending.slice(0, 140),
      comma = Math.max(prefix.lastIndexOf(', '), prefix.lastIndexOf('; '), prefix.lastIndexOf(': ')),
      cut = comma >= 35 ? comma + 1 : prefix.lastIndexOf(' ');
    if (cut >= 65) {
      queueSpeech(streamPending.slice(0, cut));
      streamPending = streamPending.slice(cut).trimStart();
    }
  }
}
function finishResponseStream(text) {
  lastSpokenAnswer = text || '';
  if (!streamText) streamPending = text || '';
  else if (text && text.startsWith(streamText)) streamPending += text.slice(streamText.length);
  flushSpeech(true);
  const question = questionFromText(text || '')?.question;
  if (settings.speechDetail !== 'full' && question && !briefSpoken.includes(cleanSpeech(question)))
    queueSpeech(question);
  $('#readFullAnswer').hidden =
    settings.speechDetail === 'full' || cleanSpeech(text || '').length <= briefSpoken.length;
  return speechQueue;
}
function waitForVoiceToFinish() {
  return speechQueue;
}

// A follow-up belongs to one assistant turn. Once answered it can never reappear.
let pendingFollowup = null,
  followupVersion = 0,
  recordEpoch = 0,
  recordingQuestionVersion = 0,
  recordingOpening = false;
function clearFollowup() {
  followupVersion++;
  pendingQuestion = '';
  pendingFollowup = null;
  const card = $('#followup');
  card.hidden = true;
  card.replaceChildren();
}
function questionFromText(text) {
  const clean = String(text || '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*|__/g, '')
    .trim();
  const end = Math.max(clean.lastIndexOf('?'), clean.lastIndexOf('？'));
  if (end < 0) return null;
  const tail = clean.slice(end + 1).trim();
  if (tail && !tail.split(/\r?\n/).every((line) => !line.trim() || /^\s*(?:[-*•]|\d+[.)])\s+/.test(line))) return null;
  const start = Math.max(clean.lastIndexOf('\n', end), clean.lastIndexOf('. ', end), clean.lastIndexOf('! ', end));
  const question = clean.slice(start + 1, end + 1).trim();
  if (!question || question.length > 400) return null;
  return { question, clean };
}
function showFollowupOptions(text, requestId = foregroundRequest) {
  if (text !== undefined) {
    clearFollowup();
    const found = questionFromText(text);
    if (!found) return false;
    pendingQuestion = found.clean;
    pendingFollowup = { ...found, requestId, version: followupVersion, listened: false };
  }
  const pending = pendingFollowup;
  if (!pending || pending.requestId !== foregroundRequest) return false;
  const card = $('#followup');
  card.replaceChildren();
  const heading = document.createElement('div');
  heading.className = 'followup-title';
  heading.textContent = pending.question;
  card.append(heading);
  let choices = [...pending.clean.matchAll(/^\s*(?:[-*•]|\d+[.)])\s+([^\n]{2,80})$/gm)].map((m) => m[1]).slice(-4);
  if (
    !choices.length &&
    /\b(?:should i|shall i|would you like|do you want|may i|can i|proceed|continue|confirm|is that okay)\b/i.test(
      pending.question,
    )
  )
    choices = ['Yes, continue', 'No, thanks'];
  if (!choices.length) choices = ['I’ll type my answer'];
  choices.push('Dismiss');
  const actions = document.createElement('div');
  actions.className = 'followup-options';
  for (const choice of choices) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = choice;
    button.onclick = () => {
      if (pendingFollowup !== pending) return;
      cancelRecording();
      clearFollowup();
      if (choice === 'Dismiss') return;
      if (/type my answer/.test(choice)) {
        $('#prompt').focus();
        return;
      }
      $('#prompt').value = choice;
      $('#form').requestSubmit();
    };
    actions.append(button);
  }
  card.append(actions);
  card.hidden = false;
  return true;
}
function cancelRecording() {
  recordEpoch++;
  recordingOpening = false;
  clearTimeout(stopTimer);
  if (listening) {
    try {
      processor?.disconnect();
      source?.disconnect();
    } catch {}
    stream?.getTracks().forEach((t) => t.stop());
    audioCtx?.close().catch(() => {});
    audioCtx = null;
    source = null;
    processor = null;
    stream = null;
    chunks = [];
    resetListen();
  }
}

const workspaceNav = document.createElement('nav');
workspaceNav.className = 'workspace-nav';
workspaceNav.setAttribute('aria-label', 'Workspace');
const workspaceDrawer = document.createElement('aside');
workspaceDrawer.className = 'workspace-drawer';
workspaceDrawer.hidden = true;
const drawerHeading = document.createElement('header');
drawerHeading.className = 'drawer-heading';
drawerHeading.innerHTML =
  '<h2 id="drawerTitle">Workspace</h2><button class="icon-button" id="drawerClose" aria-label="Close workspace panel">×</button>';
workspaceDrawer.append(drawerHeading);
const workspacePanels = [
  ['tasks', 'Tasks', 'M4 6h16M4 12h16M4 18h16', jobsPanel],
  ['memory', 'Memory', 'M5 4h14v16H5zM9 8h6M9 12h6', memoryPanel],
  ['agenda', 'Agenda', 'M4 5h16v15H4zM8 3v4M16 3v4M4 10h16', agendaPanel],
  ['timing', 'Timing', 'M4 18V9M10 18V4M16 18v-7M22 18V7', latencyPanel],
];
let openWorkspaceView = '';
function selectWorkspaceView(id) {
  if (id) window.atlasColab?.selectAssistant();
  openWorkspaceView = id;
  workspaceDrawer.hidden = !id;
  document.querySelector('.layout').classList.toggle('inspecting', Boolean(id));
  for (const [key, label, , panel] of workspacePanels) {
    panel.hidden = key !== id;
    panel.open = key === id;
    const button = workspaceNav.querySelector('[data-view="' + key + '"]');
    button.setAttribute('aria-expanded', String(key === id));
    if (key === id) $('#drawerTitle').textContent = label;
  }
  if (id === 'memory') void refreshMemory();
  if (id === 'agenda') void refreshAgenda();
}
for (const [id, label, path, panel] of workspacePanels) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'nav-item';
  button.dataset.view = id;
  button.setAttribute('aria-expanded', 'false');
  button.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="' +
    path +
    '"/></svg><span>' +
    label +
    '</span>';
  if (id === 'tasks') {
    const count = document.createElement('span');
    count.id = 'taskCount';
    count.className = 'nav-count';
    count.hidden = true;
    button.append(count);
  }
  button.onclick = () => selectWorkspaceView(openWorkspaceView === id ? '' : id);
  workspaceNav.append(button);
  panel.hidden = true;
  workspaceDrawer.append(panel);
}
document.querySelector('.layout').prepend(workspaceNav);
document.querySelector('.layout').append(workspaceDrawer);
$('#drawerClose').onclick = () => selectWorkspaceView('');
function refreshColabModels() {
  window.atlasColab?.refreshModels();
}

const core = document.querySelector('.core'),
  presence = document.createElement('div');
presence.className = 'presence';
const presenceCopy = document.createElement('div');
presenceCopy.className = 'presence-copy';
presenceCopy.append($('#greeting'), sub);
presence.append(document.querySelector('.orbwrap'), presenceCopy);
core.insertBefore(presence, document.querySelector('.corehead').nextSibling);
const composer = document.createElement('div');
composer.className = 'composer';
const voiceBar = document.createElement('div');
voiceBar.className = 'voice-bar';
voiceBar.append(mic, wave, stopButton);
const voiceHint = document.createElement('span');
voiceHint.className = 'voice-hint';
voiceHint.id = 'voiceHint';
voiceBar.append(voiceHint);
composer.append($('#form'), voiceBar, document.querySelector('.workspace-bar'));
core.append(composer);
const userTurn = document.createElement('div');
userTurn.className = 'user-turn';
userTurn.id = 'userTurn';
userTurn.hidden = true;
response.prepend(userTurn);
core.insertBefore(response, composer);
const emptyState = document.createElement('div');
emptyState.className = 'empty-state';
emptyState.innerHTML =
  '<p>What shall we work on?</p><div class="suggestions"><button type="button">What’s on my agenda?</button><button type="button">Set a timer for 5 minutes</button><button type="button">Help me plan a project</button></div>';
core.insertBefore(emptyState, response);
emptyState.querySelectorAll('button').forEach(
  (button) =>
    (button.onclick = () => {
      $('#prompt').value = button.textContent;
      $('#prompt').focus();
    }),
);
$('#prompt').setAttribute('aria-label', 'Message ATLAS');
output.setAttribute('aria-live', 'polite');
output.setAttribute('role', 'log');
document.querySelector('.foot span:last-child').textContent =
  'Speech and memories stay local · model requests use your provider';
function syncWorkspace() {
  const state = listening
    ? 'listening'
    : orb.classList.contains('speaking')
      ? 'speaking'
      : orb.classList.contains('thinking')
        ? 'thinking'
        : 'ready';
  if (document.body.dataset.state !== state) document.body.dataset.state = state;
  const hasConversation = response.classList.contains('show');
  document.body.classList.toggle('has-conversation', hasConversation);
  emptyState.hidden = hasConversation;
  stopButton.hidden = !(orb.classList.contains('speaking') || speechBatch?.running);
  const running = jobList.filter((j) => j.status === 'running').length,
    badge = $('#taskCount');
  badge.hidden = !running;
  if (badge.textContent !== String(running)) badge.textContent = String(running);
  const hint =
    state === 'listening'
      ? 'Listening · pauses send automatically'
      : state === 'speaking'
        ? 'Speaking · talk to interrupt'
        : state === 'thinking'
          ? 'Working · you can keep talking'
          : settings.wakeWordEnabled
            ? 'Say “Hey Atlas” or tap the mic'
            : 'Tap the mic to talk';
  if (voiceHint.textContent !== hint) voiceHint.textContent = hint;
}
var workspaceSyncFrame = 0;
function scheduleWorkspaceSync() {
  if (workspaceSyncFrame) return;
  workspaceSyncFrame = requestAnimationFrame(() => {
    workspaceSyncFrame = 0;
    syncWorkspace();
  });
}
const workspaceObserver = new MutationObserver(scheduleWorkspaceSync);
for (const node of [orb, response, mic])
  workspaceObserver.observe(node, { attributes: true, attributeFilter: ['class'] });
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) scheduleWorkspaceSync();
});
syncWorkspace();
function renderAnswer(text, target = output) {
  if (target === output) cancelStreamPaint();
  target.replaceChildren();
  const blocks = String(text || '').split(/(```[\s\S]*?```)/g);
  for (const block of blocks) {
    if (block.startsWith('```')) {
      const pre = document.createElement('pre');
      pre.className = 'answer-code';
      pre.textContent = block.replace(/^```[^\n]*\n?/, '').replace(/```$/, '');
      target.append(pre);
      continue;
    }
    const parts = block.split(/(\[[^\]]+\]\(https?:\/\/[^)]+\)|\*\*[^*]+\*\*|`[^`]+`)/g);
    for (const part of parts) {
      const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/);
      if (link) {
        const a = document.createElement('a');
        a.href = link[2];
        a.textContent = link[1];
        a.onclick = (event) => {
          event.preventDefault();
          window.atlas.openLink(link[2]).catch((error) => toast(error.message));
        };
        target.append(a);
      } else if (part.startsWith('**') && part.endsWith('**')) {
        const strong = document.createElement('strong');
        strong.textContent = part.slice(2, -2);
        target.append(strong);
      } else if (part.startsWith('`') && part.endsWith('`')) {
        const code = document.createElement('code');
        code.textContent = part.slice(1, -1);
        target.append(code);
      } else target.append(document.createTextNode(part));
    }
  }
}

document.addEventListener('pointerdown', (e) => {
  if (
    innerWidth <= 1200 &&
    openWorkspaceView &&
    !workspaceDrawer.contains(e.target) &&
    !workspaceNav.contains(e.target)
  )
    selectWorkspaceView('');
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') selectWorkspaceView('');
});

let briefSentences = 0,
  briefSpoken = '',
  lastSpokenAnswer = '';
const readFullButton = document.createElement('button');
readFullButton.id = 'readFullAnswer';
readFullButton.className = 'quiet-button';
readFullButton.textContent = 'Read full answer';
readFullButton.hidden = true;
output.after(readFullButton);
function queueResponseSpeech(text) {
  const clean = cleanSpeech(text);
  if (!clean) return;
  if (settings.speechDetail !== 'full') {
    if (briefSentences >= 2 || briefSpoken.length >= 320) return;
    briefSentences++;
    briefSpoken += (briefSpoken ? ' ' : '') + clean;
  }
  queueSpeech(text);
}
async function readFullAnswer() {
  if (!lastSpokenAnswer) return;
  cancelRecording();
  stopWakeListener();
  await speak(lastSpokenAnswer);
  if (settings.wakeWordEnabled) startWakeListener();
}
readFullButton.onclick = () => void readFullAnswer();
async function refreshProviderHealth() {
  try {
    const box = $('#providerHealth'),
      items = await window.atlas.providerHealth();
    box.replaceChildren();
    const heading = document.createElement('h3');
    heading.textContent = 'Provider availability';
    box.append(heading);
    for (const item of items) {
      const row = document.createElement('p');
      row.style.fontSize = '12px';
      row.textContent =
        item.provider +
        ': ' +
        (item.available
          ? 'Available'
          : 'Usage limit · ' +
            (item.estimated ? 'estimated retry ' : 'retry ') +
            new Date(item.retryAt).toLocaleTimeString());
      if (!item.available) {
        const button = document.createElement('button');
        button.className = 'quiet-button';
        button.textContent = 'Retry now';
        button.onclick = async () => {
          await window.atlas.providerHealth({ action: 'retry', provider: item.provider });
          await refreshProviderHealth();
          toast(item.provider + ' will be tried again when selected for a task.');
        };
        row.append(' ', button);
      }
      box.append(row);
    }
  } catch {}
}
setInterval(() => {
  if ($('#settingsDialog').open) void refreshProviderHealth();
}, 2000);
void refreshProviderHealth();
