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
    decompose: 'Split into milestones',
    plan_review: 'Review milestone plan',
    plan_revise: 'Revise milestones',
  };
  function stageLabel(row, phase, index) {
    const name = row.milestone === 'final' && phase === 'review' ? 'Final review' : phaseName[phase] || phase;
    return (/^M\d+$/.test(row.milestone || '') ? row.milestone + ' · ' : '') + name + ' · ' + (index + 1);
  }
  // Older handovers list decisions as plain strings; newer ones carry the stated reason.
  const decisionText = (value) => (typeof value === 'string' ? value : text(value?.decision, 500));
  const strings = (rows, limit) =>
    (Array.isArray(rows) ? rows.filter((row) => typeof row === 'string') : []).slice(0, limit);
  // A stage's public summary plus the rationale the provider stated, clearly marked as unverified.
  function stageDetail(row) {
    const h = row.handover,
      section = (title, rows) => (rows.length ? title + ':\n' + rows.map((value) => '- ' + value).join('\n') : '');
    const parts = h
      ? [
          section(
            'Decisions',
            (Array.isArray(h.decisions) ? h.decisions : [])
              .slice(0, 8)
              .map(
                (value) =>
                  text(decisionText(value), 500) + (value?.reason ? ' (because ' + text(value.reason, 500) + ')' : ''),
              )
              .filter((value) => value.trim()),
          ),
          section(
            'Assumptions',
            strings(h.assumptions, 8).map((value) => text(value, 500)),
          ),
          section(
            'Alternatives considered',
            strings(h.alternatives, 8).map((value) => text(value, 500)),
          ),
          section(
            'Risks',
            strings(h.risks, 8).map((value) => text(value, 500)),
          ),
          ['high', 'medium', 'low'].includes(h.confidence)
            ? 'Confidence: ' + h.confidence + (h.confidenceReason ? ' - ' + text(h.confidenceReason, 500) : '')
            : '',
        ].filter(Boolean)
      : [];
    return (
      text(h?.summary || row.output, 2400) +
      (parts.length ? '\n\nModel-reported rationale (not verified by ATLAS):\n' + parts.join('\n\n') : '')
    );
  }
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
    // With milestones, the left column keeps the whole-task criteria; milestone criteria sit under their milestone.
    const criteria = (
      state.taskCriteria?.length
        ? [...state.taskCriteria, ...(state.criteria || []).filter((row) => row.id === 'PLAN')]
        : state.criteria?.length
          ? state.criteria
          : [{ id: 'TASK', text: task }]
    ).slice(0, 31);
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
        label: stageLabel(row, phase, index),
        detail: stageDetail(row),
        status: row.decision || 'reported',
        origin: 'provider reported',
        rank: index - first + 1,
      });
    }
    // Milestones: the plan as its own row, each with its criteria and its ATLAS check (or none).
    const milestones = (state.milestones || []).slice(0, 8);
    // Pending milestones start after any running stage so it never looks like part of a later milestone.
    let pendingRank = reports.length - first + 1 + (active ? 1 : 0);
    for (const [i, row] of milestones.entries()) {
      const started = reports.findIndex((report, n) => n >= first && report.milestone === row.id),
        rank = started >= 0 ? started - first + 1 : pendingRank++,
        run = row.checkRun;
      const id = node({
        id: 'milestone:' + text(row.id, 8),
        kind: 'milestone',
        label: text(row.id, 8) + ' · ' + text(row.title, 90),
        detail: [
          text(row.goal),
          ...(row.criteria || []).map((item) => text(item.id, 12) + ': ' + text(item.text, 300)),
          'Check: ' + (text(row.check, 500) || 'none; reviewed without an ATLAS check (unverified)'),
          row.summary ? 'Delivered: ' + text(row.summary, 600) : '',
        ]
          .filter(Boolean)
          .join('\n'),
        status: text(row.status, 20) + (row.unverified ? ' · unverified' : ''),
        origin: 'provider planned',
        rank,
      });
      edge(i ? 'milestone:' + text(milestones[i - 1].id, 8) : 'task', id, i ? 'then' : 'plans', 'provider planned');
      for (const item of (row.criteria || []).slice(0, 6)) {
        const child = node({
          id: 'criterion:' + text(item.id, 80),
          kind: 'criterion',
          milestone: text(row.id, 8),
          label: text(item.id, 80) + ': ' + text(item.text, 110),
          detail: text(item.text),
          status: row.status === 'done' ? 'accepted' : 'required',
          origin: 'provider planned',
          rank,
        });
        edge(id, child, 'requires');
      }
      if (run || !row.check) {
        const child = node({
          id: 'milestone-check:' + text(row.id, 8),
          kind: 'check',
          label:
            text(row.id, 8) +
            (run
              ? ' check · ' + (Number.isInteger(run.exitCode) ? 'exit ' + run.exitCode : text(run.status, 40))
              : ' · unverified, no check'),
          detail: run
            ? [text(run.command, 500), 'Status: ' + text(run.status, 40), text(run.error, 500), text(run.output, 1200)]
                .filter(Boolean)
                .join('\n')
            : 'This milestone had no check command, so only the reviewer verified it.',
          status: run ? text(run.status, 40) || 'unknown' : 'unverified',
          origin: run ? 'ATLAS executed' : 'ATLAS recorded',
          rank,
        });
        edge(id, child, run ? 'verified by' : 'check status');
      }
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
        label: stageLabel(row, phase, index),
        detail: stageDetail(row),
        status: row.decision || 'reported',
        origin: 'provider reported',
        rank: index - first + 1,
      });
      const milestone = milestones.find((item) => item.id === row.milestone),
        parent = milestone && ids.has('milestone:' + milestone.id) ? 'milestone:' + milestone.id : 'task';
      edge(parent, id, phase.startsWith('proposal_') ? 'proposes' : phase === 'reproduce' ? 'reproduces' : 'contains');
      // A reproduction informs the fix the same way proposals inform a build.
      if (phase.startsWith('proposal_') || phase === 'reproduce') proposals.push(id);
      else if (['build', 'draft', 'synthesis'].includes(phase)) {
        for (const proposal of proposals) edge(proposal, id, 'informs');
        artifact = id;
      } else if (phase === 'review') {
        if (artifact) edge(artifact, id, 'reviewed by');
        for (const criterion of milestone?.criteria || criteria)
          edge('criterion:' + text(criterion.id, 80), id, 'checked against');
      } else if (['decompose', 'plan_review', 'plan_revise'].includes(phase)) {
        if (index > first)
          edge('pass:' + (index - 1), id, phase === 'plan_review' ? 'plan reviewed by' : 'revises plan');
      } else if (['fix', 'revise'].includes(phase)) {
        if (index > first) edge('pass:' + (index - 1), id, 'requests fix');
        artifact = id;
      } else if (index > first) edge('pass:' + (index - 1), id, 'clarifies');
      for (const [i, decision] of (row.handover?.decisions || []).slice(0, 4).entries()) {
        const child = node({
          id: id + ':decision:' + i,
          kind: 'decision',
          label: text(decisionText(decision), 100),
          detail:
            text(decisionText(decision)) +
            (decision?.reason ? '\nReason (model-reported): ' + text(decision.reason, 500) : ''),
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
            decisions: (last.handover?.decisions || []).slice(0, 4).map((value) => text(decisionText(value), 160)),
            files: (last.handover?.changedFiles || []).slice(0, 8).map((value) => text(value, 140)),
            nextActions: (last.handover?.nextActions || []).slice(0, 4).map((value) => text(value, 160)),
            // Stated risks and assumptions let the next stage check or answer them.
            risks: strings(last.handover?.risks, 2).map((value) => text(value, 160)),
            assumptions: strings(last.handover?.assumptions, 2).map((value) => text(value, 160)),
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
        snapshot.lastHandover.risks = snapshot.lastHandover.risks.slice(0, 1);
        snapshot.lastHandover.assumptions = [];
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
