const { parentPort } = require('node:worker_threads');
const context = require('./project-context').createProjectContext();
const index = require('./project-knowledge').createKnowledgeIndex({ listFiles: context.files });
let chain = Promise.resolve();
parentPort.on('message', ({ id, cwd, query, options, action }) => {
  chain = chain.then(async () => {
    try {
      parentPort.postMessage({
        id,
        value:
          action === 'vault'
            ? await require('./vault-notes').searchVault(cwd, query, options)
            : action === 'analyze'
              ? await index.analyze(cwd, options)
              : await index.search(cwd, query, options),
      });
    } catch (error) {
      parentPort.postMessage({ id, error: error.message });
    }
  });
});
