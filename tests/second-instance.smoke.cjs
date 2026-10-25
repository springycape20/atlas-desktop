const {app}=require('electron');
const path=require('node:path');
if(!process.env.ATLAS_LAUNCH_TEST_DATA)throw Error('A temporary test data directory is required.');
app.setPath('userData',process.env.ATLAS_LAUNCH_TEST_DATA);
app.on('browser-window-created',()=>{console.error('Duplicate app created a second window.');app.exit(1);});
setTimeout(()=>{console.error('Duplicate app did not exit promptly.');app.exit(1);},10000).unref();
require(path.resolve(process.argv[2]));
