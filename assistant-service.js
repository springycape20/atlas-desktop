const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

function createService({ directory, launchApp, volume, notify, now = () => Date.now() }) {
  const file = path.join(directory, 'assistant-data.json');
  let state = { memories: [], reminders: [], jobs: [] };
  if (fs.existsSync(file)) state = { ...state, ...JSON.parse(fs.readFileSync(file, 'utf8')) };
  function save() { fs.mkdirSync(directory, { recursive: true }); fs.writeFileSync(file + '.tmp', JSON.stringify(state, null, 2)); fs.renameSync(file + '.tmp', file); }
  function memory(action, item = {}) {
    if (action === 'list') return state.memories;
    if (action === 'delete') state.memories = state.memories.filter(m => m.id !== item.id);
    else if (action === 'save') {
      const text = String(item.text || '').trim(); if (!text || text.length > 2000) throw Error('Memory must contain 1–2000 characters.');
      const category = ['preference', 'project', 'decision', 'task'].includes(item.category) ? item.category : 'preference';
      const value = { id: item.id || randomUUID(), text, category, updatedAt: now() };
      const index = state.memories.findIndex(m => m.id === value.id); if (index >= 0) state.memories[index] = value; else state.memories.push(value);
      state.memories = state.memories.slice(-100);
    } else throw Error('Unknown memory action');
    save(); return state.memories;
  }
  function reminder(action, item = {}) {
    if (action === 'list') return state.reminders;
    if (action === 'delete') state.reminders = state.reminders.filter(r => r.id !== item.id);
    else if (action === 'done') { const r = state.reminders.find(r => r.id === item.id); if (r) r.acknowledged = true; }
    else if (action === 'save') {
      const title = String(item.title || '').trim(); const dueAt = Number(item.dueAt); const repeatMinutes = Number(item.repeatMinutes) || 0;
      if (!title || title.length > 300 || !Number.isFinite(dueAt) || dueAt <= now() || repeatMinutes < 0 || repeatMinutes > 525600) throw Error('Choose a title and a future reminder time.');
      state.reminders.push({ id: randomUUID(), title, dueAt, repeatMinutes, acknowledged: false });
    } else throw Error('Unknown reminder action');
    save(); return state.reminders;
  }
  function tick() {
    let changed = false;
    for (const r of state.reminders) if (!r.firedAt && r.dueAt <= now()) {
      r.firedAt = now(); changed = true;
      if (r.repeatMinutes) { r.lastFiredAt = now(); r.dueAt += (Math.floor((now() - r.dueAt) / (r.repeatMinutes * 60000)) + 1) * r.repeatMinutes * 60000; r.firedAt = null; }
      notify({ id: r.id, title: r.title });
    }
    if (changed) save();
  }
  async function local(prompt) {
    const text = prompt.trim().replace(/[.!?]+$/, ''); let match;
    if (/^(?:what(?:'s| is) (?:the )?(?:time|date)|time|date)$/i.test(text)) return new Date(now()).toLocaleString();
    if ((match = text.match(/^open (notepad|calculator|explorer|file explorer|settings)$/i))) { await launchApp(match[1].toLowerCase()); return `Opened ${match[1]}.`; }
    if ((match = text.match(/^(?:volume (up|down)|(mute|unmute)(?: volume)?)$/i))) { await volume(match[1] || 'mute'); return match[1] ? `Volume ${match[1]}.` : 'Toggled mute.'; }
    if ((match = text.match(/^(?:set (?:a )?timer (?:for )?|remind me in )(\d+(?:\.\d+)?)\s*(seconds?|minutes?|hours?)(?:\s+(?:to|for)\s+(.+))?$/i))) {
      const seconds = Number(match[1]) * (/hour/i.test(match[2]) ? 3600 : /minute/i.test(match[2]) ? 60 : 1);
      if (seconds < 1 || seconds > 31536000) throw Error('Choose a timer between one second and one year.');
      reminder('save', { title: match[3] || 'Timer finished', dueAt: now() + seconds * 1000 }); return `Timer set for ${match[1]} ${match[2]}.`;
    }
    if ((match = text.match(/^remember (?:that )?(.+)$/i))) { memory('save', { text: match[1] }); return 'Saved to your editable memory.'; }
    if (/^(?:what(?:'s| is) (?:on )?my agenda(?: today)?|show (?:my )?agenda)$/i.test(text)) return state.reminders.filter(r => !r.acknowledged).sort((a,b)=>a.dueAt-b.dueAt).map(r=>`${new Date(r.dueAt).toLocaleString()}: ${r.title}`).join('\n') || 'Your agenda is clear.';
    return null;
  }
  function context(prompt, cwd) {
    const terms = new Set((prompt + ' ' + cwd).toLowerCase().match(/[a-z0-9]{3,}/g) || []);
    return state.memories.map(m=>({m,score:m.category==='preference'?2:0,...{}})).map(x=>({...x,score:x.score+[...terms].filter(t=>x.m.text.toLowerCase().includes(t)).length})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,12).map(x=>`[${x.m.category}] ${x.m.text}`).join('\n');
  }
  return { memory, reminder, tick, local, context, state, save };
}
module.exports = { createService };
