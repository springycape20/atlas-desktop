// A local MCP controller that deliberately ignores request cancellation, like a
// blocking native shell call. Production controller cleanup must stop its child.
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { ListToolsRequestSchema, CallToolRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const { spawn } = require('node:child_process');
const path = require('node:path');
const server = new Server({ name: 'atlas-shell-test', version: '1' }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: ['ControlStatus', 'PowerShell', 'App'].map(name => ({ name, inputSchema: { type: 'object' } })),
}));
server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
  if (params.name === 'ControlStatus') return { structuredContent: { enabled: false, state: 'disabled' }, content: [] };
  if (params.name === 'App') {
    const child = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore', windowsHide: true, detached: true });
    child.unref();
    return { content: [{ type: 'text', text: String(child.pid) }] };
  }
  const child = spawn(path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
    ['-NoProfile', '-NonInteractive', '-Command', params.arguments.command], { stdio: 'ignore', windowsHide: true });
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', () => resolve({ content: [{ type: 'text', text: 'Finished' }] }));
  });
});
server.connect(new StdioServerTransport()).catch(() => process.exit(1));
