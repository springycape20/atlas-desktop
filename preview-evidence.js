function cleanSteps(value) {
  if (!Array.isArray(value) || !value.length || value.length > 30) throw Error('Enter 1–30 browser steps.');
  return value.map((row) => {
    if (!row || !['click', 'fill', 'assert-text', 'assert-visible', 'assert-path', 'wait'].includes(row.action))
      throw Error('Unknown browser step.');
    if (row.action === 'wait') {
      if (!Number.isInteger(row.ms) || row.ms < 0 || row.ms > 5000) throw Error('Wait must be 0–5000 ms.');
      return { action: 'wait', ms: row.ms };
    }
    if (typeof row.value !== 'string' && ['fill', 'assert-text', 'assert-path'].includes(row.action))
      throw Error('This step requires a text value.');
    if (row.value?.length > 4000) throw Error('Step text is too long.');
    if (
      row.action !== 'assert-path' &&
      (typeof row.selector !== 'string' || !row.selector.trim() || row.selector.length > 500)
    )
      throw Error('Enter a CSS selector under 500 characters.');
    return {
      action: row.action,
      ...(row.action === 'assert-path' ? {} : { selector: row.selector }),
      ...(['fill', 'assert-text', 'assert-path'].includes(row.action) ? { value: row.value } : {}),
    };
  });
}
function stepScript(step) {
  return `(() => {
    const step=${JSON.stringify(step)};
    if(step.action==='assert-path') { if(location.pathname+location.search!==step.value)throw Error('Page path did not match');return true; }
    const element=document.querySelector(step.selector);
    if(!element)throw Error('No element matches '+step.selector);
    if(step.action==='click')element.click();
    if(step.action==='fill') {
      if(!['INPUT','TEXTAREA','SELECT'].includes(element.tagName))throw Error('Fill requires an input, textarea or select');
      const setter=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element),'value')?.set;
      if(setter)setter.call(element,step.value);else element.value=step.value;
      element.dispatchEvent(new Event('input',{bubbles:true}));element.dispatchEvent(new Event('change',{bubbles:true}));
    }
    if(step.action==='assert-text'&&!(element.textContent||'').includes(step.value))throw Error('Expected text was not found');
    if(step.action==='assert-visible') {const r=element.getBoundingClientRect(),s=getComputedStyle(element);if(!r.width||!r.height||s.visibility==='hidden'||s.display==='none'||s.opacity==='0')throw Error('Element is hidden');}
    return true;
  })()`;
}
function comparePixels(before, after, threshold = 16) {
  const a = before.getSize(),
    b = after.getSize();
  if (a.width !== b.width || a.height !== b.height)
    throw Error('Screenshot dimensions changed. Capture a baseline at the current viewport.');
  const first = before.toBitmap(),
    second = after.toBitmap();
  if (first.length !== second.length || first.length !== a.width * a.height * 4)
    throw Error('Unsupported screenshot pixel scale.');
  let changed = 0,
    left = a.width,
    right = -1,
    top = a.height,
    bottom = -1;
  for (let offset = 0; offset < first.length; offset += 4) {
    if (![0, 1, 2, 3].some((channel) => Math.abs(first[offset + channel] - second[offset + channel]) > threshold))
      continue;
    changed++;
    const pixel = offset / 4,
      x = pixel % a.width,
      y = Math.floor(pixel / a.width);
    left = Math.min(left, x);
    right = Math.max(right, x);
    top = Math.min(top, y);
    bottom = Math.max(bottom, y);
  }
  return {
    changedPixels: changed,
    totalPixels: a.width * a.height,
    changedPercent: Math.round((changed / (a.width * a.height)) * 10000) / 100,
    bounds: changed ? { x: left, y: top, width: right - left + 1, height: bottom - top + 1 } : null,
    threshold,
    note: 'Pixel differences include animation, fonts and dynamic content; they do not by themselves identify a regression.',
  };
}
function profileDelta(before, after) {
  if (!before || before.url !== after.url || before.width !== after.width || before.height !== after.height)
    return null;
  const fields = ['domNodes', 'jsHeapMB', 'loadMs', 'domReadyMs'];
  return Object.fromEntries(
    fields.map((key) => [
      key,
      Number.isFinite(before[key]) && Number.isFinite(after[key])
        ? Math.round((after[key] - before[key]) * 100) / 100
        : null,
    ]),
  );
}
module.exports = { cleanSteps, stepScript, comparePixels, profileDelta };
