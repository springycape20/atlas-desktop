const { randomUUID, createHash } = require('node:crypto');
const { localBase, modelId } = require('./local-model');
const { sameProject, newest } = require('./work-overview');
function normalise(vector) {
  if (
    !Array.isArray(vector) ||
    vector.length < 2 ||
    vector.length > 4096 ||
    vector.some((x) => typeof x !== 'number' || !Number.isFinite(x))
  )
    throw Error('Invalid embedding vector from local server.');
  const length = Math.hypot(...vector);
  if (!Number.isFinite(length) || !length) throw Error('Invalid embedding vector magnitude.');
  return vector.map((x) => x / length);
}
const digest = (rows) => createHash('sha256').update(JSON.stringify(rows)).digest('hex');
function documents(jobs, cwd) {
  let chars = 0;
  const rows = [];
  for (const job of newest(jobs)
    .filter((j) => j.status === 'completed' && (!cwd || sameProject(j, cwd)))
    .slice(0, 100)) {
    const text = [job.prompt, job.result?.output]
      .filter((x) => typeof x === 'string')
      .join('\n\n')
      .slice(0, 4000);
    if (!text.trim() || chars + text.length > 200000) continue;
    chars += text.length;
    rows.push({
      id: job.id,
      title: String(job.title || job.prompt || 'Task').slice(0, 100),
      cwd: job.projectFolder || job.cwd || '',
      text,
    });
  }
  return rows;
}
async function embed(base, model, texts, request) {
  const response = await request(localBase(base) + '/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    redirect: 'error',
    signal: AbortSignal.timeout(30000),
    body: JSON.stringify({ model: modelId(model), input: texts }),
  });
  if (!response.ok) throw Error('Local embedding server returned HTTP ' + response.status + '.');
  let bytes = 0,
    text = '';
  const decoder = new TextDecoder();
  for await (const part of response.body) {
    bytes += part.length;
    if (bytes > 2 * 1024 * 1024) throw Error('Embedding response exceeded 2 MiB.');
    text += decoder.decode(part, { stream: true });
  }
  text += decoder.decode();
  const value = JSON.parse(text),
    data = value.data;
  if (!Array.isArray(data) || data.length !== texts.length)
    throw Error('Local server returned an incomplete embedding batch.');
  const rows = new Array(texts.length);
  for (const row of data) {
    if (!Number.isInteger(row.index) || row.index < 0 || row.index >= texts.length || rows[row.index])
      throw Error('Invalid embedding index.');
    rows[row.index] = normalise(row.embedding);
  }
  if (rows.some((row) => row.length !== rows[0].length)) throw Error('Embedding dimensions differ.');
  return rows;
}
function createSemanticSolutions({ tasks, fetch: request = fetch }) {
  const previews = new Map(),
    indexes = new Map();
  let generation = 0;
  const current = (cwd) => documents(tasks(), cwd);
  async function action(input = {}) {
    const cwd = typeof input.cwd === 'string' ? input.cwd : '';
    if (input.action === 'preview') {
      const docs = current(cwd),
        token = randomUUID();
      previews.set(token, { cwd, hash: digest(docs), expires: Date.now() + 600000 });
      if (previews.size > 4) previews.delete(previews.keys().next().value);
      return {
        token,
        documents: docs,
        characters: docs.reduce((n, d) => n + d.text.length, 0),
        note: 'Up to 100 completed tasks and 200,000 characters, with at most 4,000 characters per task. No vault notes, files or attachments are indexed.',
      };
    }
    if (input.action === 'clear') {
      generation++;
      indexes.clear();
      previews.clear();
      return { cleared: true };
    }
    if (input.action === 'build') {
      if (input.consent !== true) throw Error('Review the task excerpts and approve local embedding first.');
      const base = localBase(input.base),
        model = modelId(input.model),
        preview = previews.get(input.token),
        docs = current(cwd),
        revision = generation;
      if (!preview || preview.cwd !== cwd || preview.expires < Date.now() || preview.hash !== digest(docs))
        throw Error('Task sources changed or preview expired. Preview the index again.');
      if (!docs.length) throw Error('No completed task solutions to index.');
      previews.delete(input.token);
      const vectors = [];
      for (let start = 0; start < docs.length; start += 16) {
        if (revision !== generation) throw Error('Semantic indexing cancelled.');
        vectors.push(
          ...(await embed(
            base,
            model,
            docs.slice(start, start + 16).map((d) => d.text),
            request,
          )),
        );
      }
      if (revision !== generation) throw Error('Semantic indexing cancelled.');
      if (vectors.some((v) => v.length !== vectors[0].length))
        throw Error('Embedding dimensions changed between batches.');
      if (digest(current(cwd)) !== digest(docs)) throw Error('Task sources changed while indexing. Preview again.');
      const id = randomUUID();
      indexes.set(id, { cwd, base, model, docs, vectors });
      if (indexes.size > 4) indexes.delete(indexes.keys().next().value);
      return { id, count: docs.length };
    }
    if (input.action === 'search') {
      const index = indexes.get(input.id),
        revision = generation;
      if (!index || index.cwd !== cwd) throw Error('Build an index for this project first.');
      const query = typeof input.query === 'string' ? input.query.trim() : '';
      if (query.length < 2 || query.length > 2000) throw Error('Enter a search question of 2–2,000 characters.');
      const [vector] = await embed(index.base, index.model, [query], request);
      if (revision !== generation || !indexes.has(input.id)) throw Error('Semantic search was cleared.');
      if (vector.length !== index.vectors[0].length) throw Error('Embedding dimensions changed. Rebuild the index.');
      const latest = new Map(current(cwd).map((d) => [d.id, digest(d)]));
      const results = index.docs
        .map((doc, i) => ({ ...doc, score: index.vectors[i].reduce((n, x, k) => n + x * vector[k], 0) }))
        .filter((d) => latest.get(d.id) === digest(index.docs.find((row) => row.id === d.id)))
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);
      return {
        results,
        stale: index.docs.filter((d) => latest.get(d.id) !== digest(d)).length,
        note: 'Cosine similarity ranks local embeddings; similarity is not factual verification.',
      };
    }
    throw Error('Unknown semantic search action.');
  }
  return { action };
}
module.exports = { normalise, documents, createSemanticSolutions };
