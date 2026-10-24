const {Server}=require('@modelcontextprotocol/sdk/server/index.js');
const {StdioServerTransport}=require('@modelcontextprotocol/sdk/server/stdio.js');
const {ListToolsRequestSchema,CallToolRequestSchema}=require('@modelcontextprotocol/sdk/types.js');
const server=new Server({name:'atlas-test-tools',version:'1.0.0'},{capabilities:{tools:{}}});
server.setRequestHandler(ListToolsRequestSchema,async()=>({tools:[{name:'echo',description:'Return input and a small image',inputSchema:{type:'object',properties:{message:{type:'string'}},required:['message']}}]}));
server.setRequestHandler(CallToolRequestSchema,async request=>({content:[{type:'text',text:request.params.arguments.message},{type:'image',mimeType:'image/png',data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='}]}));
server.connect(new StdioServerTransport()).catch(()=>process.exit(1));
