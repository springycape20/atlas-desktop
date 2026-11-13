const fs = require('node:fs/promises');
const path = require('node:path');
const { prepare } = require('./prepare-compliance.cjs');
const { prepareProductionCode } = require('./production-code.cjs');

module.exports = async (context) => {
  const root = context.appDir;
  const { out } = await prepare(root);
  const report = await prepareProductionCode(root);
  await fs.writeFile(path.join(out, 'PRODUCTION-CODE.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(`Prepared ${report.files.length} MIT-noticed production code files.`);
};
