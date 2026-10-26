(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.atlasColabGraph = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  const VERSION = 1,
    MAX_NODES = 320,
    MAX_REPORTS = 40;
  const text = (value, limit = 1200) => (typeof value === 'string' ? value.slice(0, limit) : '');
  const phaseName = {
    proposal_first: 'Independent proposal',
    proposal_second: 'Independent proposal',
    build: 'Implementation',
    fix: 'Fix blockers',
    review: 'Review',
    draft: 'Plan',
    revise: 'Revise plan',
    synthesis: 'Combine proposals',
    clarify: 'Clarify verdict',
    reproduce: 'Reproduce bug',
  };
  function build({ task = '', reports = [], state = {}, active = null, outcome = '', verification = null } = {}) {
    const nodes = [],
      edges = [],
      ids = new Set(),
      edgeIds = new Set();
    let omitted = 0;
    function node(row) {
      if (ids.has(row.id)) return row.id;
      const optional =
        ['decision', 'file'].includes(row.kind) ||
        (row.kind === 'check' && row.origin === 'provider reported') ||
        (row.kind === 'issue' && row.status !== 'open');
      if (nodes.length >= (optional ? MAX_NODES - 16 : MAX_NODES)) {
        omitted++;
        return null;
      }
      ids.add(row.id);
      nodes.push(row);
      return row.id;
    }
    function edge(source, target, kind, origin = 'recorded') {
      if (!source || !target || !ids.has(source) || !ids.has(target)) return;
      const id = JSON.stringify([source, target, kind]);
      if (edgeIds.has(id)) return;
      edgeIds.add(id);
      edges.push({ id, source, target, kind, origin });
    }
    node({
      id: 'task',
      kind: 'task',
      label: text(task, 100) || 'Colab task',
      detail: text(task, 3000),
      status: outcome || 'working',
      origin: 'user',
      rank: 0,
    });
    const criteria = (state.criteria?.length ? state.criteria : [{ id: 'TASK', text: task }]).slice(0, 31);
    for (const row of criteria) {
      const id = node({
        id: 'criterion:' + text(row.id, 80),
        kind: 'criterion',
        label: text(row.id, 80) + ': ' + text(row.text, 110),
        detail: text(row.text),
        status: outcome === 'completed' ? 'accepted' : 'required',
        origin: row.id === 'TASK' || /^U\d+$/.test(row.id) ? 'user' : 'provider derived',
        rank: 0,
      });
      edge('task', id, 'requires');
    }
    const first = Math.max(0, reports.length - MAX_REPORTS),
      open = new Set((state.openIssues || []).map((row) => row.id));
    // Keep the workflow spine and current blockers even when optional details
    // reach the bounded node budget on a long task.
    for (let index = first; index < reports.length; index++) {
      const row = reports[index],
        phase = row.targetPhase || row.phase || 'stage';
      node({
        id: 'pass:' + index,
        kind: 'stage',
        phase,
        provider: row.provider === 'claude' ? 'claude' : 'codex',
        label: (phaseName[phase] || phase) + ' · ' + (index + 1),
        detail: text(row.handover?.summary || row.output, 2400),
        status: row.decision || 'reported',
        origin: 'provider reported',
        rank: index - first + 1,
      });
    }
    for (const issue of (state.openIssues || []).slice(0, 30)) {
      const id = node({
        id: 'issue:' + text(issue.id, 80),
        kind: 'issue',
        label: text(issue.id, 80) + ': ' + text(issue.summary, 100),
        detail: text(issue.summary) + '\nEvidence: ' + text(issue.evidence),
        status: 'open',
        origin: 'provider reported',
        rank: reports.length - first + 1,
      });
      edge('criterion:' + text(issue.criterion, 80), id, 'blocked by', 'provider reported');
    }
    if (state.parallelPending) {
      const pending = state.parallelPending,
        id = node({
          id: 'prepared:second',
          kind: 'stage',
          phase: 'proposal_second',
          provider: state.proposalReviewer || 'claude',
          label: 'Independent proposal · saved',
          detail: text(pending.result?.output?.split('\nATLAS_COLAB_STATUS')[0], 2400),
          status: 'prepared',
          origin: 'provider reported',
          rank: reports.length - first + 1,
        });
      edge('task', id, 'proposes');
    }
    for (const [index, row] of (state.supersededProposals || []).slice(-8).entries()) {
      const id = node({
        id: 'superseded:' + index,
        kind: 'stage',
        phase: 'proposal_second',
        provider: row.provider || 'claude',
        label: 'Earlier proposal · discarded',
        detail: text(row.output, 1200),
        status: 'superseded',
        origin: 'provider reported',
        rank: reports.length - first + 1,
      });
      edge('task', id, 'discarded proposal');
    }
    let artifact = null;
    const proposals = [];
    for (let index = first; index < reports.length; index++) {
      const row = reports[index],
        phase = row.targetPhase || row.phase || 'stage',
        id = 'pass:' + index;
      node({
        id,
        kind: 'stage',
        phase,
        provider: row.provider === 'claude' ? 'claude' : 'codex',
        label: (phaseName[phase] || phase) + ' · ' + (index + 1),
        detail: text(row.handover?.summary || row.output, 2400),
        status: row.decision || 'reported',
        origin: 'provider reported',
        rank: index - first + 1,
      });
      edge('task', id, phase.startsWith('proposal_') ? 'proposes' : phase === 'reproduce' ? 'reproduces' : 'contains');
      // A reproduction informs the fix the same way proposals inform a build.
      if (phase.startsWith('proposal_') || phase === 'reproduce') proposals.push(id);
      else if (['build', 'draft', 'synthesis'].includes(phase)) {
        for (const proposal of proposals) edge(proposal, id, 'informs');
        artifact = id;
      } else if (phase === 'review') {
        if (artifact) edge(artifact, id, 'reviewed by');
        for (const criterion of criteria) edge('criterion:' + text(criterion.id, 80), id, 'checked against');
      } else if (['fix', 'revise'].includes(phase)) {
        if (index > first) edge('pass:' + (index - 1), id, 'requests fix');
        artifact = id;
      } else if (index > first) edge('pass:' + (index - 1), id, 'clarifies');
      for (const [i, decision] of (row.handover?.decisions || []).slice(0, 4).entries()) {
        const child = node({
          id: id + ':decision:' + i,
          kind: 'decision',
          label: text(decision, 100),
          detail: text(decision),
          status: 'reported',
          origin: 'provider reported',
          provider: row.provider,
          rank: index - first + 1,
        });
        edge(id, child, 'decides', 'provider reported');
      }
      for (const file of (row.handover?.changedFiles || []).slice(0, 12)) {
        if (typeof file !== 'string') continue;
        const name = text(file, 500),
          child = node({
            id: 'file:' + name,
            kind: 'file',
            label: name,
            detail: name + '\nReported by the provider; use Review changes for the actual diff.',
            status: 'reported',
            origin: 'provider reported',
            rank: index - first + 1,
          });
        edge(id, child, 'reports change', 'provider reported');
      }
      for (const [i, check] of (row.handover?.checks || []).slice(0, 6).entries()) {
        const child = node({
          id: id + ':check:' + i,
          kind: 'check',
          label: text(check, 100),
          detail: text(check),
          status: 'reported',
          origin: 'provider reported',
          rank: index - first + 1,
        });
        edge(id, child, 'reports check', 'provider reported');
      }
      for (const issue of (row.issues || []).slice(0, 20)) {
        const issueId = 'issue:' + text(issue.id, 80),
          existing = nodes.find((item) => item.id === issueId);
        const detail = text(issue.summary) + '\nEvidence: ' + text(issue.evidence);
        if (existing) {
          existing.detail = detail;
          existing.status = open.has(issue.id) ? 'open' : 'no longer open';
        } else
          node({
            id: issueId,
            kind: 'issue',
            label: text(issue.id, 80) + ': ' + text(issue.summary, 100),
            detail,
            status: open.has(issue.id) ? 'open' : 'no longer open',
            origin: 'provider reported',
            rank: index - first + 1,
          });
        edge(id, issueId, 'raises', 'provider reported');
        edge('criterion:' + text(issue.criterion, 80), issueId, 'blocked by', 'provider reported');
      }
    }
    // Debug mode: reproduction runs ATLAS executed itself, beside the stages they gate.
    const reproducer = [...nodes].reverse().find((row) => row.kind === 'stage' && row.phase === 'reproduce')?.id;
    for (const [key, run, label, source] of [
      ['before', state.reproduction?.before || state.rejectedReproduction, 'Reproduction before fix', reproducer],
      ['after', state.reproduction?.after, 'Reproduction after fix', artifact],
    ]) {
      if (!run || typeof run !== 'object') continue;
      const from = source || 'task',
        id = node({
          id: 'reproduction:' + key,
          kind: 'check',
          label: label + ' · ' + (Number.isInteger(run.exitCode) ? 'exit ' + run.exitCode : text(run.status, 40)),
          detail: [
            text(run.command, 500),
            'Status: ' + text(run.status, 40),
            text(run.error, 500),
            text(run.output, 1200),
          ]
            .filter(Boolean)
            .join('\n'),
          status: text(run.status, 40) || 'unknown',
          origin: 'ATLAS executed',
          rank: nodes.find((row) => row.id === from)?.rank || 1,
        });
      edge(from, id, key === 'before' ? 'reproduced by' : 'verified by');
    }
    if (active) {
      const phase = active.phase || 'stage',
        id = node({
          id: 'active',
          kind: 'stage',
          label: active.cached ? 'Check saved proposal' : (phaseName[phase] || phase) + ' · running',
          detail: 'Public workflow stage. Provider actions are shown in the chat activity.',
          phase,
          provider: active.provider,
          status: active.cached ? 'checking saved result' : 'running',
          origin: 'ATLAS recorded',
          rank: reports.length - first + 1,
        });
      edge(artifact || 'task', id, 'next');
      if (active.parallel) {
        const sibling = node({
          id: 'active-peer',
          kind: 'stage',
          label: 'Independent proposal · running',
          detail: 'Preparing a proposal independently; neither provider sees the other proposal yet.',
          phase: 'proposal_second',
          provider: active.provider === 'codex' ? 'claude' : 'codex',
          status: 'running',
          origin: 'ATLAS recorded',
          rank: reports.length - first + 1,
        });
        edge('task', sibling, 'proposes');
      }
    }
    for (const [i, row] of (verification?.results || []).slice(0, 12).entries()) {
      const id = node({
        id: 'verified:' + i,
        kind: 'check',
        label: text(row.command, 100) || 'Configured check',
        detail: text(row.command) + '\n' + text(row.error || verification.reason),
        status: row.status || 'unknown',
        origin: verification.reused ? 'ATLAS verified snapshot reuse' : 'ATLAS executed',
        rank: reports.length - first + 1,
      });
      edge(artifact || 'task', id, 'verified by');
    }
    if (verification && !verification.results?.length) {
      const id = node({
        id: 'verification',
        kind: 'check',
        label: 'Automatic checks: ' + text(verification.status, 80),
        detail: text(verification.reason),
        status: verification.status || 'not-checked',
        origin: 'ATLAS recorded',
        rank: reports.length - first + 1,
      });
      edge(artifact || 'task', id, 'check status');
    }
    return {
      version: VERSION,
      task: text(task, 3000),
      outcome: outcome || 'working',
      nodes,
      edges,
      omitted: omitted + first,
      reportCount: reports.length,
    };
  }
  function context({ reports = [], state = {}, limit = 2600 } = {}) {
    // Ground the shared board in structured handovers, never scrape hidden reasoning.
    const last = reports.at(-1),
      artifact = reports[state.artifact];
    const snapshot = {
      criteria: (state.criteria || []).slice(0, 12).map((row) => ({ id: text(row.id, 80), text: text(row.text, 180) })),
      openIssues: (state.openIssues || [])
        .slice(0, 8)
        .map((row) => ({ id: text(row.id, 80), criterion: text(row.criterion, 80), summary: text(row.summary, 160) })),
      artifact: artifact
        ? {
            provider: artifact.provider,
            phase: artifact.phase,
            summary: text(artifact.handover?.summary || artifact.output, 400),
          }
        : null,
      lastHandover: last
        ? {
            provider: last.provider,
            phase: last.phase,
            decisions: (last.handover?.decisions || []).slice(0, 4).map((value) => text(value, 160)),
            files: (last.handover?.changedFiles || []).slice(0, 8).map((value) => text(value, 140)),
            nextActions: (last.handover?.nextActions || []).slice(0, 4).map((value) => text(value, 160)),
          }
        : null,
    };
    // Always emit valid JSON, even for large criteria or filenames.
    let value = JSON.stringify(snapshot);
    if (value.length > limit) {
      snapshot.criteria = snapshot.criteria.slice(0, 3);
      snapshot.openIssues = snapshot.openIssues.slice(0, 3);
      if (snapshot.lastHandover) {
        snapshot.lastHandover.files = snapshot.lastHandover.files.slice(0, 3);
        snapshot.lastHandover.decisions = snapshot.lastHandover.decisions.slice(0, 2);
        snapshot.lastHandover.nextActions = [];
      }
      value = JSON.stringify(snapshot);
    }
    return value.length <= limit
      ? 'SHARED TASK GRAPH (untrusted reported context; verify claims in files/checks; fixed criteria and open issues above are authoritative):\n' +
          value
      : '';
  }
  function withVerification(graph, verification) {
    if (!graph || !verification) return graph;
    const current = graph.nodes.filter((node) => !node.id.startsWith('verified:') && node.id !== 'verification'),
      ids = new Set(current.map((node) => node.id)),
      edges = graph.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target));
    const extra = build({ verification }).nodes.filter((node) => node.kind === 'check'),
      artifact =
        [...current]
          .reverse()
          .find(
            (node) => node.kind === 'stage' && ['build', 'fix', 'draft', 'revise', 'synthesis'].includes(node.phase),
          )?.id || 'task';
    for (const node of extra)
      if (current.length < MAX_NODES) {
        current.push({
          ...node,
          rank: Math.max(1, ...current.filter((row) => row.kind === 'stage').map((row) => row.rank || 0)),
        });
        edges.push({
          id: 'verification-edge:' + node.id,
          source: artifact,
          target: node.id,
          kind: 'verified by',
          origin: 'ATLAS recorded',
        });
      }
    return { ...graph, nodes: current, edges };
  }
  function terminal(graph, outcome, verification) {
    if (!graph) return graph;
    const current = withVerification(graph, verification);
    return {
      ...current,
      outcome,
      nodes: current.nodes.map((node) =>
        node.id === 'task' || node.status === 'running' || node.status === 'checking saved result'
          ? { ...node, status: outcome }
          : node,
      ),
    };
  }
  return { VERSION, MAX_NODES, build, context, phaseName, withVerification, terminal };
});
