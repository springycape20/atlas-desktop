function manifest(value) {
  return {
    name: value.name,
    id: value.id,
    transport: value.url ? 'HTTP' : 'Local process',
    target: value.url ? new URL(value.url).origin : [value.command, ...(value.args || [])].join(' '),
    declared: value.permissions || { filesystem: 'unspecified', network: 'unspecified', execution: 'unspecified' },
    enforced: false,
    note: 'Declarations describe requested access, not an OS sandbox. MCP tools can execute with the integration process account. Inspect tool schemas and approve calls separately.',
  };
}
function cleanPermissions(value) {
  const result = {};
  for (const key of ['filesystem', 'network', 'execution'])
    result[key] = String(value?.[key] || 'unspecified').slice(0, 1000);
  return result;
}
module.exports = { manifest, cleanPermissions };
