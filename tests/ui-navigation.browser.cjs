const { app, BrowserWindow, protocol } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const root = path.join(__dirname, '..'),
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-navigation-'));
app.disableHardwareAcceleration();
app.setPath('userData', path.join(temp, 'data'));
protocol.registerSchemesAsPrivileged([
  { scheme: 'atlas', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);
const mock = `window.__uiErrors=[];window.addEventListener('error',e=>__uiErrors.push(e.message));window.__saved={speakResponses:false,wakeWordEnabled:false};window.atlas=new Proxy({getSettings:async()=>structuredClone(__saved),home:async()=>'C:/Projects/Demo',latestConversation:async()=>null,jobs:async()=>[],providerAuthStatus:async()=>({}),discoverModels:async()=>({}),chatMetadata:async()=>({}),taskQueue:async()=>({items:[],paused:true,concurrency:1}),workflows:async()=>[],saveSettings:async value=>(__saved=structuredClone(value))},{get:(t,k)=>t[k]||(String(k).startsWith('on')?()=>()=>{}:async()=>[])});`;
const timeout = setTimeout(() => {
  console.error('Navigation UI timed out');
  app.exit(1);
}, 60000).unref();
app.whenReady().then(async () => {
  try {
    protocol.handle('atlas', (request) => {
      const file = new URL(request.url).pathname.slice(1);
      if (file === '__mock.js') return new Response(mock, { headers: { 'Content-Type': 'application/javascript' } });
      const content = fs.readFileSync(path.join(root, file || 'index.html'));
      return new Response(
        file ? content : content.toString().replace('<head>', '<head><script src="/__mock.js"></script>'),
        {
          headers: {
            'Content-Type': !file
              ? 'text/html'
              : file.endsWith('.css')
                ? 'text/css'
                : file.endsWith('.png')
                  ? 'image/png'
                  : 'application/javascript',
          },
        },
      );
    });
    const win = new BrowserWindow({
      show: false,
      width: 1280,
      height: 800,
      webPreferences: { offscreen: true, backgroundThrottling: false },
    });
    await win.loadURL('atlas://app/');
    await win.webContents.executeJavaScript(
      `(async()=>{await new Promise(r=>setTimeout(r,300));const names=[...document.querySelectorAll('.workspace-nav>.nav-item')].filter(b=>getComputedStyle(b).display!=='none').map(b=>b.textContent.trim());if(JSON.stringify(names)!==JSON.stringify(['Chat','Colab','Projects','Tasks','Library','Settings']))throw Error('Navigation: '+JSON.stringify(names));await atlasUi.open('tasks','Queue');if(!atlasUi.hub.querySelector('#queueState'))throw Error('Queue did not mount');atlasUi.hub.close();await new Promise(r=>setTimeout(r,20));await atlasUi.open('library','Workflows');if(!atlasUi.hub.textContent.includes('Reusable Colab workflows'))throw Error('Workflows not in Library');atlasUi.hub.close();await new Promise(r=>setTimeout(r,20));await atlasUi.open('tasks','Recovery');if(!atlasUi.hub.textContent.includes('Saved tasks'))throw Error('Recovery not in Tasks');atlasUi.hub.close();await new Promise(r=>setTimeout(r,20));const handle=document.querySelector('.shell-chat-resize');handle.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));if(handle.getAttribute('aria-valuenow')!=='260')throw Error('Keyboard resize failed');if(document.querySelector('#send').getAttribute('form')!=='form')throw Error('Send lost its form');if(!document.querySelector('.colab-composer .shell-composer-tools #colabStart'))throw Error('Colab actions not grouped');})()`,
    );
    const out = path.join(root, '.handover', 'ui-navigation');
    fs.mkdirSync(out, { recursive: true });
    await win.webContents.executeJavaScript(`(async()=>{
      window.__searchOriginals={searchWork:atlas.searchWork,memory:atlas.memory,historyList:atlas.historyList,projectKnowledge:atlas.projectKnowledge};window.__fileSearchCalls=0;
      atlas.searchWork=async()=>[{kind:'task',title:'Cobalt renderer fix',text:'Task result',jobId:'fixture'}];atlas.memory=async()=>[{id:'fixture',category:'decision',text:'Keep cobalt rendering local'}];atlas.historyList=async()=>[];atlas.projectKnowledge=async()=>{__fileSearchCalls++;return {results:[{path:'cobalt.js',line:4,excerpt:'const cobalt = true;'}]};};
      await atlasUi.open('library','Search all work');const search=atlasUi.hub.querySelector('input');search.value='cobalt';const run=[...atlasUi.hub.querySelectorAll('button')].find(button=>button.textContent==='Search local work');run.click();await new Promise(r=>setTimeout(r,100));if(__fileSearchCalls)throw Error('File search must be opt-in');atlasUi.hub.querySelector('input[type=checkbox]').checked=true;run.click();await new Promise(r=>setTimeout(r,100));if(!atlasUi.hub.textContent.includes('cobalt.js:4')||!atlasUi.hub.textContent.includes('3 results shown'))throw Error('Unified search sources missing');
    })()`);
    fs.writeFileSync(path.join(out, 'unified-search.png'), (await win.webContents.capturePage()).toPNG());
    const capabilityInspection = await win.webContents.executeJavaScript(
      `(()=>{const copy=atlasUi.hub.cloneNode(true);const styles=[...document.querySelectorAll('style')].map(item=>item.outerHTML).join('');return '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>ATLAS local work search</title>'+styles+'<style>'+${JSON.stringify(fs.readFileSync(path.join(root, 'ui-shell.css'), 'utf8'))}+'</style><style>body{margin:0;padding:16px;background:#0c171e}.shell-hub{position:relative;inset:auto;margin:0 auto;max-width:100%;height:calc(100vh - 32px);box-sizing:border-box}</style></head><body class="atlas-ui"><main>'+copy.outerHTML.replace('<dialog','<section').replace('</dialog>','</section>')+'</main></body></html>';})()`,
    );
    fs.writeFileSync(path.join(out, 'capabilities-inspect.html'), capabilityInspection);
    await win.webContents.executeJavaScript(
      `Object.assign(atlas,__searchOriginals);atlasUi.hub.close();new Promise(r=>setTimeout(r,30))`,
    );
    await win.webContents.executeJavaScript(
      `atlas.taskProgress=async()=>[{id:'fixture',title:'Implement keyboard search',status:'running',stage:'Waiting for review',elapsedMs:65000,estimate:{lowMs:30000,highMs:90000,samples:8},waiting:['Run project tests?'],stages:4,finishedStages:2,checks:[]}];atlasUi.open('tasks','Progress')`,
    );
    await new Promise((r) => setTimeout(r, 100));
    await win.webContents.executeJavaScript(
      `if(!atlasUi.hub.textContent.includes('Waiting for your decision')||!atlasUi.hub.textContent.includes('8 historical samples'))throw Error('Progress evidence missing')`,
    );
    fs.writeFileSync(path.join(out, 'task-progress.png'), (await win.webContents.capturePage()).toPNG());
    await win.webContents.executeJavaScript(`atlasUi.hub.close();new Promise(r=>setTimeout(r,30))`);
    await win.webContents.executeJavaScript(
      `window.__reviewJobs=atlas.jobs;window.__reviewChanges=atlas.changes;atlas.jobs=async()=>[{id:'review-demo',prompt:'Improve keyboard navigation',status:'completed',cwd:'C:/Projects/Demo',changeId:'fixture',verification:{status:'passed',results:[{command:'npm test',status:'passed',output:'Fixture checks passed'}]}}];atlas.changes=async()=>({files:[{path:'ui-shell.js'}],added:12,removed:3});atlasUi.open('tasks','Review centre')`,
    );
    await new Promise((r) => setTimeout(r, 100));
    await win.webContents.executeJavaScript(
      `if(!atlasUi.hub.textContent.includes('npm test · passed')||!atlasUi.hub.textContent.includes('ui-shell.js'))throw Error('Unified review evidence missing')`,
    );
    fs.writeFileSync(path.join(out, 'review-centre.png'), (await win.webContents.capturePage()).toPNG());
    await win.webContents.executeJavaScript(
      `atlas.jobs=__reviewJobs;atlas.changes=__reviewChanges;atlasUi.hub.close();new Promise(r=>setTimeout(r,30))`,
    );
    await win.webContents.executeJavaScript(
      `window.__originalProjects=atlas.projects;atlas.projects=async()=>[{id:'fixture',name:'Demo project',cwd:'C:/Projects/Demo',environmentTools:'Node.js and npm',environmentCommands:'npm ci',environmentPrompt:true}];atlasPower.show('Project environments')`,
    );
    await new Promise((r) => setTimeout(r, 100));
    fs.writeFileSync(path.join(out, 'project-environments.png'), (await win.webContents.capturePage()).toPNG());
    await win.webContents.executeJavaScript(
      `atlas.projects=__originalProjects;atlasPower.close();new Promise(r=>setTimeout(r,30))`,
    );
    await win.webContents.executeJavaScript(`atlasUi.open('tasks','Plan a task')`);
    await new Promise((r) => setTimeout(r, 120));
    await win.webContents.executeJavaScript(
      `if(!atlasUi.hub.open||!atlasUi.hub.textContent.includes('Review a plan before starting'))throw Error('Task planning screen missing');`,
    );
    fs.writeFileSync(path.join(out, 'task-plan.png'), (await win.webContents.capturePage()).toPNG());
    await win.webContents.executeJavaScript(`atlasUi.hub.close();new Promise(r=>setTimeout(r,30))`);
    await win.webContents.executeJavaScript(`atlasPower.show('Hardware check')`);
    fs.writeFileSync(path.join(out, 'hardware-check.png'), (await win.webContents.capturePage()).toPNG());
    await win.webContents.executeJavaScript(`atlasPower.close();new Promise(r=>setTimeout(r,30))`);
    await win.webContents.executeJavaScript(`atlasPower.show('Model routing')`);
    fs.writeFileSync(path.join(out, 'model-routing.png'), (await win.webContents.capturePage()).toPNG());
    await win.webContents.executeJavaScript(`atlasPower.close();new Promise(r=>setTimeout(r,30))`);
    await win.webContents.executeJavaScript(`atlasUi.open('library','Project memory')`);
    fs.writeFileSync(path.join(out, 'project-memory.png'), (await win.webContents.capturePage()).toPNG());
    await win.webContents.executeJavaScript(`atlasUi.hub.close();new Promise(r=>setTimeout(r,30))`);
    await win.webContents.executeJavaScript(`(async()=>{
      if(document.querySelector('.provider-usage-dock'))throw Error('Old overlapping dock remains');
      atlas.providerUsage=async()=>{throw Error('Subscription usage must not be polled');};
      const originalJobs=atlas.jobs, originalHealth=atlas.providerHealth;
      atlas.jobs=async()=>[{provider:'codex',status:'running'},{provider:'claude',status:'completed'},{collaboration:true,status:'completed'}];
      atlas.providerHealth=async()=>[{provider:'codex',available:true},{provider:'claude',available:false,retryAt:Date.now()+60000,estimated:true}];
      document.getElementById('providerActivityOpen').click();await new Promise(r=>setTimeout(r,100));
      const rows=[...document.querySelectorAll('.provider-activity-row')];
      if(rows.length!==3||!rows[0].textContent.includes('1 running')||!rows[1].textContent.includes('1 completed')||!rows[2].textContent.includes('1 retained tasks'))throw Error('Provider activity counts incorrect');
      if(!rows[0].textContent.includes('allowance is unknown')||!rows[1].textContent.includes('estimated retry'))throw Error('Availability labels misleading');
      atlas.jobs=originalJobs;atlas.providerHealth=originalHealth;
    })()`);
    fs.writeFileSync(path.join(out, 'provider-activity.png'), (await win.webContents.capturePage()).toPNG());
    await win.webContents.executeJavaScript(
      `document.getElementById('settingsDialog').close();new Promise(r=>setTimeout(r,30))`,
    );
    await win.webContents.executeJavaScript(`atlasUi.open('tasks','Parallel')`);
    await new Promise((r) => setTimeout(r, 200));
    fs.writeFileSync(path.join(out, 'tasks.png'), (await win.webContents.capturePage()).toPNG());
    await win.webContents.executeJavaScript(`(async()=>{
      const groups=()=>[...document.querySelectorAll('.shell-hub-groups button')];
      const pressed=()=>groups().find(b=>b.getAttribute('aria-pressed')==='true')?.textContent;
      const tablist=atlasUi.hub.querySelector('[role=tablist]');
      if(groups().some(b=>b.textContent==='More'))throw Error('A task section has no group');
      if(pressed()!=='Work'||tablist.children.length>10)throw Error('Tasks did not open one compact group');
      await atlasUi.open('tasks','Check logs');
      if(pressed()!=='Review'||tablist.querySelector('[aria-selected=true]')?.textContent!=='Check logs')throw Error('Direct open did not reveal its group');
      groups().find(b=>b.textContent==='Power tools').click();
      await new Promise(r=>setTimeout(r,80));
      if(!tablist.hidden||!atlasUi.hub.textContent.includes('Choose the next step'))throw Error('Power tools group did not open directly');
      for(const group of groups().map(b=>b.textContent)){
        groups().find(b=>b.textContent===group).click();
        await new Promise(r=>setTimeout(r,40));
        for(const name of [...tablist.children].map(b=>b.textContent).filter(name=>name!=='Terminal')){
          await atlasUi.open('tasks',name);
          await new Promise(r=>setTimeout(r,60));
          const panel=document.getElementById('shellHubContent');
          if(panel.scrollWidth>panel.clientWidth+1)throw Error(name+' overflows sideways');
        }
      }
      toast("Error invoking remote method 'atlas:x': Error: Readable");
      if(document.getElementById('toast').textContent!=='Readable')throw Error('Toast kept the internal IPC prefix');
      await atlasUi.open('tasks','Reminders');
      if(!(new Date(document.getElementById('reminderDate').value).getTime()>Date.now()))throw Error('Reminder time was not prefilled');
      document.getElementById('reminderSave').click();
      await new Promise(r=>setTimeout(r,40));
      if(document.getElementById('toast').textContent!=='Enter what the reminder is for.')throw Error('Empty reminder message is unclear');
    })()`);
    await new Promise((r) => setTimeout(r, 100));
    fs.writeFileSync(path.join(out, 'tasks-reminders.png'), (await win.webContents.capturePage()).toPNG());
    await win.webContents.executeJavaScript(`atlasUi.open('tasks','Queue')`);
    await new Promise((r) => setTimeout(r, 200));
    fs.writeFileSync(path.join(out, 'tasks-queue.png'), (await win.webContents.capturePage()).toPNG());
    const [fullWidth, fullHeight] = win.getContentSize();
    win.setContentSize(390, 800);
    await new Promise((r) => setTimeout(r, 200));
    fs.writeFileSync(path.join(out, 'tasks-390.png'), (await win.webContents.capturePage()).toPNG());
    win.setContentSize(fullWidth, fullHeight);
    await new Promise((r) => setTimeout(r, 100));
    await win.webContents.executeJavaScript(`(async()=>{
      const wait=()=>new Promise(r=>setTimeout(r,40));
      atlasUi.hub.close();await wait();
      document.dispatchEvent(new KeyboardEvent('keydown',{key:'k',ctrlKey:true,bubbles:true}));
      if(!atlasCommandMenu.dialog.open)throw Error('Ctrl+K did not open search');
      const search=atlasCommandMenu.dialog.querySelector('input');
      search.value='appearance';search.dispatchEvent(new Event('input'));
      if(atlasCommandMenu.dialog.querySelectorAll('.command-results button').length!==1)throw Error('Command filtering failed');
      search.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));await wait();
      if(!document.querySelector('#settingsDialog').open||atlasSettings.current()!=='Appearance')throw Error('Search did not navigate');
      const choose=(id,value)=>{const field=document.getElementById(id);field.value=value;field.dispatchEvent(new Event('change',{bubbles:true}));};
      choose('uiTheme','light');choose('uiTextScale','1.3');
      if(document.documentElement.dataset.uiTheme!=='light')throw Error('Theme preview failed');
      atlasCommandMenu.open();search.value='models';search.dispatchEvent(new Event('input'));search.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));await wait();
      if(document.getElementById('uiTheme').value!=='light')throw Error('Navigation lost unsaved changes');
      document.querySelector('#settingsDialog').close();await wait();
      if(document.documentElement.dataset.uiTheme!=='dark')throw Error('Discarded preview persisted');
      await atlasUi.settings('Appearance');await wait();choose('uiTheme','contrast');choose('uiTextScale','1.15');choose('uiDensity','compact');
      document.getElementById('settingsSave').click();await wait();
      if(__saved.uiTheme!=='contrast'||__saved.uiTextScale!==1.15)throw Error('Appearance not included in save');
      await atlasUi.settings('Appearance');await wait();
      if(document.getElementById('uiTheme').value!=='contrast')throw Error('Saved appearance lost on reopen');
      if(__uiErrors.length)throw Error(__uiErrors.join('; '));
    })()`);
    for (const theme of ['light', 'contrast', 'dark']) {
      await win.webContents.executeJavaScript(
        `document.getElementById('uiTheme').value='${theme}';document.getElementById('uiTextScale').value='1.3';document.getElementById('uiTextScale').dispatchEvent(new Event('change',{bubbles:true}));`,
      );
      for (const width of [1280, 768, 640]) {
        win.setSize(width, 800);
        await new Promise((r) => setTimeout(r, 80));
        const overflow = await win.webContents.executeJavaScript(
          `document.documentElement.scrollWidth>innerWidth||document.getElementById('settingsDialog').scrollWidth>document.getElementById('settingsDialog').clientWidth+2`,
        );
        if (overflow) throw Error('Appearance overflows: ' + theme + ' ' + width);
        fs.writeFileSync(
          path.join(out, 'appearance-' + theme + '-' + width + '.png'),
          (await win.webContents.capturePage()).toPNG(),
        );
      }
    }
    win.setSize(1280, 800);
    await win.webContents.executeJavaScript(
      `document.getElementById('uiTheme').value='light';document.getElementById('uiTheme').dispatchEvent(new Event('change',{bubbles:true}));`,
    );
    const inspection = await win.webContents.executeJavaScript(`(()=>{
      const live=document.getElementById('settingsDialog'), copy=live.cloneNode(true);
      const h2=copy.querySelector('h2'), h1=document.createElement('h1');h1.textContent=h2.textContent;h1.style.cssText='font-size:23px;margin:0';h2.replaceWith(h1);
      [...live.querySelectorAll('select')].forEach((field,index)=>{[...copy.querySelectorAll('select')[index].options].forEach(option=>option.toggleAttribute('selected',option.value===field.value));});
      copy.querySelectorAll('.setting-section[hidden]').forEach(section=>section.remove());
      const styles=[...document.querySelectorAll('style')].map(item=>item.outerHTML).join('');
      return '<!doctype html><html data-ui-theme="light" data-ui-density="comfortable" style="--atlas-text-scale:1.3"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>ATLAS Appearance demo</title>'+styles+'<style>'+${JSON.stringify(fs.readFileSync(path.join(root, 'ui-shell.css'), 'utf8'))}+'</style><style>body{margin:0;padding:16px}#settingsDialog{display:flex;position:relative;inset:auto;margin:16px auto;max-width:100%;height:calc(100vh - 64px);box-sizing:border-box}</style></head><body class="atlas-ui"><main>'+copy.outerHTML.replace('<dialog','<section').replace('</dialog>','</section>')+'</main></body></html>';
    })()`);
    fs.writeFileSync(path.join(out, 'inspect.html'), inspection);
    for (const theme of ['light', 'contrast']) {
      await win.webContents.executeJavaScript(
        `atlasAppearanceUi.saved({uiTheme:'${theme}',uiTextScale:1.3});document.getElementById('settingsDialog').close();`,
      );
      await new Promise((r) => setTimeout(r, 80));
      fs.writeFileSync(path.join(out, 'chat-' + theme + '.png'), (await win.webContents.capturePage()).toPNG());
      await win.webContents.executeJavaScript(`atlasUi.open('tasks','Parallel')`);
      await new Promise((r) => setTimeout(r, 80));
      fs.writeFileSync(path.join(out, 'tasks-' + theme + '.png'), (await win.webContents.capturePage()).toPNG());
      await win.webContents.executeJavaScript(`atlasUi.hub.close()`);
      await new Promise((r) => setTimeout(r, 40));
    }
    win.setSize(1280, 800);
    await win.webContents.executeJavaScript(
      `document.getElementById('settingsDialog').close();atlasCommandMenu.open();`,
    );
    await new Promise((r) => setTimeout(r, 80));
    fs.writeFileSync(path.join(out, 'search.png'), (await win.webContents.capturePage()).toPNG());
    await win.webContents.executeJavaScript(
      `document.getElementById('commandMenu')?.close();document.querySelectorAll('dialog[open]').forEach(d=>d.close());`,
    );
    for (const theme of ['dark', 'light', 'contrast'])
      for (const scale of [1, 1.3])
        for (const width of [1280, 1024, 768, 640]) {
          win.setContentSize(width, 800);
          for (const scope of ['assistant', 'colab']) {
            await win.webContents.executeJavaScript(
              `atlasAppearanceUi.saved({uiTheme:${JSON.stringify(theme)},uiTextScale:${scale}});document.querySelector('[data-chat-workspace="${scope}"]').click();`,
            );
            await new Promise((r) => setTimeout(r, 40));
            const issue = await win.webContents
              .executeJavaScript(
                `(()=>{try{
              const composer=document.querySelector('${scope === 'colab' ? '.colab-composer' : '.composer'}');
              const visible=e=>e.checkVisibility({visibilityProperty:true,opacityProperty:true})&&e.getClientRects().length&&(!e.closest('details:not([open])')||e.closest('summary'));
              const buttons=[...composer.querySelectorAll('button')].filter(visible), fields=[...composer.querySelectorAll('textarea')].filter(visible);
              const intersects=(a,b)=>{a=a.getBoundingClientRect();b=b.getBoundingClientRect();return Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1};
              const terminal=buttons.find(b=>b.textContent==='Terminal');
              if(!terminal?.closest('.shell-composer-tools'))throw Error('Terminal outside action row');
              for(const button of buttons){
                for(const field of fields)if(intersects(button,field))throw Error('Composer overlap: '+button.textContent);
                for(const other of buttons)if(button!==other&&intersects(button,other))throw Error('Buttons overlap: '+button.textContent+' / '+other.textContent);
                const r=button.getBoundingClientRect();if(r.left<0||r.right>innerWidth+1||r.bottom>innerHeight+1)throw Error('Button outside viewport: '+button.textContent);
              }
              const controls=[...document.querySelectorAll('input,textarea,select')].filter(visible).filter(e=>e.getBoundingClientRect().width>4&&e.getBoundingClientRect().height>4);
              for(const button of [...document.querySelectorAll('button')].filter(visible))
                for(const field of controls)if(intersects(button,field))throw Error('Control overlap: '+button.textContent+' / '+(field.id||field.getAttribute('aria-label')||field.tagName));
            }catch(error){return error.message}})()`,
              )
              .catch((error) => {
                throw Error(theme + ' scale ' + scale + ' width ' + width + ' ' + scope + ': ' + error.message);
              });
            if (issue) throw Error(theme + ' scale ' + scale + ' width ' + width + ' ' + scope + ': ' + issue);
            if (theme === 'dark' && scale === 1 && [1280, 768, 640].includes(width))
              fs.writeFileSync(
                path.join(out, 'composer-' + scope + '-' + width + '.png'),
                (await win.webContents.capturePage()).toPNG(),
              );
          }
        }
    console.log(
      'PASS: Navigation, embedded tools, keyboard resizing, composers, Ctrl+K search, saved/discarded appearance and three themes at three widths.',
    );
    clearTimeout(timeout);
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
