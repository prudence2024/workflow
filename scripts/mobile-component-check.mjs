import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import { readFile, readdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';

// Real UI components and the production CSS, with navigation/actions replaced
// only at the fixture boundary. No Clerk session or database bypass is used.
const result = await build({
  stdin: { contents: `
    import React from 'react';
    import { createRoot } from 'react-dom/client';
    import { Sidebar } from '@/components/app/Sidebar';
    import { Topbar } from '@/components/app/Topbar';
    import { ThemeProvider } from '@/components/theme/ThemeProvider';
    import { Card, CardHeader, CardBody } from '@/components/ui/Surfaces';
    import { Stat, Table, THead, TH, TR, TD } from '@/components/ui/Data';
    import { LinkButton } from '@/components/ui/Button';
    import { WorkflowAiPanel } from '@/components/app/WorkflowAiPanel';
    const org = {orgId:'fixture',orgName:'Disposable workspace with a deliberately long name',role:'owner',planKey:'free'};
    const user = {name:'Disposable Test User',email:'fixture@example.invalid'};
    createRoot(document.getElementById('root')).render(<ThemeProvider>
      <div className="flex min-h-screen w-full min-w-0 max-w-full">
        <Sidebar isPlatformAdmin={false}/>
        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <Topbar user={user} orgs={[org]} currentOrg={org} isPlatformAdmin={false}/>
          <main className="min-w-0 w-full max-w-full flex-1 px-4 py-6 sm:px-6 lg:px-8">
            <div className="space-y-6">
              <div className="flex flex-wrap gap-2">{['New campaign','Import records','Add contact','Test a form'].map(label=><LinkButton href="#fixture" key={label} size="sm">{label}</LinkButton>)}</div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{['Total contacts','Active campaigns','Usage','Quick actions'].map(label=><Stat key={label} label={label} value="123,456" hint="Fixture content"/>)}</div>
              <Card><CardHeader title="Current campaigns" description="Safe disposable component fixture"/><CardBody><Table><THead><TH>Name</TH><TH>Details</TH></THead><tbody><TR><TD>Wide table fixture</TD><TD>{'Long data '.repeat(30)}</TD></TR></tbody></Table></CardBody></Card>
            </div>
          </main><WorkflowAiPanel/>
        </div>
      </div>
    </ThemeProvider>);
  `, loader:'tsx', resolveDir:process.cwd() },
  bundle:true, write:false, platform:'browser', jsx:'automatic',
  plugins:[{name:'fixture-boundaries',setup(builder){
    builder.onResolve({filter:/^next\/(link|image|navigation)$/},args=>({path:args.path,namespace:'fixture'}));
    builder.onResolve({filter:/^@\/app\/.*actions$/},args=>({path:args.path,namespace:'fixture'}));
    builder.onLoad({filter:/.*/,namespace:'fixture'},args=>({loader:'tsx',resolveDir:process.cwd(),contents:
      args.path==='next/link' ? `import React from 'react'; export default function Link(p){return <a {...p}/>}` :
      args.path==='next/image' ? `import React from 'react'; export default function Image({priority,...p}){return <img {...p}/>}` :
      args.path==='next/navigation' ? `export const usePathname=()=>'/dashboard'; export const useRouter=()=>({refresh(){}});` :
      `export async function switchOrgAction(){} export async function logoutAction(){}`
    }));
  }}]
});
const cssFiles = (await readdir('.next/static/chunks')).filter(file=>file.endsWith('.css'));
assert.ok(cssFiles.length,'Production CSS is required');
const css = (await Promise.all(cssFiles.map(file=>readFile(`.next/static/chunks/${file}`,'utf8')))).join('\n');
const server = createServer(async (req,res)=>{
  if (req.url==='/brand/icon-light.png' || req.url==='/brand/icon-dark.png') {
    res.setHeader('Content-Type','image/png');res.end(await readFile(`public${req.url}`));return;
  }
  if(req.url==='/fixture.js'){res.setHeader('Content-Type','text/javascript');res.end(result.outputFiles[0].text);}
  else {res.setHeader('Content-Type','text/html');res.end(`<html><head><style>${css}</style></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>`);}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({executablePath:process.env.CHROME_EXECUTABLE_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const deadline=setTimeout(()=>{console.error('COMPONENT_TEST_TIMEOUT_180S');void browser.close();setTimeout(()=>process.exit(124),3000);},180_000);
let checks=0;
async function widthCheck(page,label){
  const metrics=await page.evaluate(()=>({client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,offenders:[...document.querySelectorAll('body *')].filter(el=>el.getBoundingClientRect().right>document.documentElement.clientWidth+1).slice(0,8).map(el=>({selector:el.tagName.toLowerCase()+'.'+String(el.className).split(' ').join('.'),width:el.getBoundingClientRect().width,left:el.getBoundingClientRect().left,right:el.getBoundingClientRect().right,parentWidth:el.parentElement?.getBoundingClientRect().width}))}));
  assert.ok(metrics.scroll<=metrics.client+1,`${label}: ${JSON.stringify(metrics)}`);checks++;
}
try {
  for(const [width,height] of [[320,568],[360,640],[375,667],[390,844],[412,915],[430,932]]){
    const page=await browser.newPage({viewport:{width,height}});
    page.setDefaultTimeout(8000);page.setDefaultNavigationTimeout(15000);
    await page.goto(base);await page.getByRole('button',{name:'Open navigation',exact:true}).waitFor();
    await widthCheck(page,`${width} closed`);
    assert.equal(await page.locator('aside').evaluate(el=>el.getBoundingClientRect().width),0);
    await page.getByRole('button',{name:/Switch workspace/}).click();await widthCheck(page,`${width} workspace menu`);
    await page.keyboard.press('Escape');
    await page.getByRole('button',{name:'Account menu',exact:true}).click();await widthCheck(page,`${width} account menu`);
    await page.keyboard.press('Escape');
    await page.getByRole('button',{name:'Open Workflow AI',exact:true}).click();await widthCheck(page,`${width} AI`);
    await page.getByRole('button',{name:'Close Workflow AI',exact:true}).click();
    await page.getByRole('button',{name:'Open navigation',exact:true}).click();await widthCheck(page,`${width} drawer`);
    assert.ok(await page.getByRole('dialog',{name:'Workflow navigation'}).isVisible());
    assert.ok(await page.getByRole('dialog',{name:'Workflow navigation'}).evaluate(el=>el.getBoundingClientRect().height)>=height-1,`${width} drawer must cover viewport height`);
    if(width===320) await page.screenshot({path:'.tmp-mobile-drawer-320.png'});
    await page.keyboard.press('Escape');await widthCheck(page,`${width} restored`);
    await page.close();
    console.log(`${width}x${height} COMPONENT_WIDTH=PASS`);
  }
  const page=await browser.newPage({viewport:{width:1440,height:900}});await page.goto(base);
  page.setDefaultTimeout(8000);page.setDefaultNavigationTimeout(15000);
  await page.getByRole('button',{name:'Collapse sidebar',exact:true}).waitFor();
  const expanded=await page.locator('main').evaluate(el=>el.getBoundingClientRect().width);
  await page.getByRole('button',{name:'Collapse sidebar',exact:true}).click();
  await page.waitForTimeout(250);
  assert.equal(await page.locator('aside').evaluate(el=>el.getBoundingClientRect().width),72);
  assert.ok(await page.getByRole('button',{name:'Expand sidebar',exact:true}).evaluate(el=>el.getBoundingClientRect().right<=el.closest('aside').getBoundingClientRect().right), 'Collapse control must stay inside its rail');
  assert.equal(await page.locator('aside a[href="/settings/usage"] svg').count(),1,'Collapsed usage control must retain an icon');
  assert.ok(await page.locator('main').evaluate(el=>el.getBoundingClientRect().width)>expanded);
  assert.equal(await page.locator('aside a[href="/dashboard"][title="Dashboard"]').count(),1);
  await page.reload();await page.getByRole('button',{name:'Expand sidebar',exact:true}).waitFor();
  const motions=[];
  for(const name of ['dashboard','contacts','imports','campaigns','communications','reports','settings']){
    const icon=page.locator(`[data-nav-icon="${name}"]`);await icon.hover();await page.waitForTimeout(250);
    const motion=await icon.evaluate(el=>{const s=getComputedStyle(el);return [s.transform,s.translate,s.rotate,s.scale].join('|')});
    assert.notEqual(motion,'none|none|none|none');motions.push(motion);checks++;
  }
  assert.equal(new Set(motions).size,7,'Each main icon must have distinct motion');
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.locator('[data-nav-icon="imports"]').hover();await page.waitForTimeout(250);
  assert.equal(await page.locator('[data-nav-icon="imports"]').evaluate(el=>{const s=getComputedStyle(el);return [s.transform,s.translate,s.rotate,s.scale].join('|')}),'none|none|none|none');
  await page.screenshot({path:'.tmp-sidebar-collapsed-1440.png'});
  await page.setViewportSize({width:1024,height:900});
  await widthCheck(page,'1024 icon rail');
  assert.equal(await page.locator('aside').evaluate(el=>el.getBoundingClientRect().width),72);
  await page.setViewportSize({width:768,height:1024});
  assert.equal(await page.locator('aside').evaluate(el=>el.getBoundingClientRect().width),0);
  await widthCheck(page,'768 drawer breakpoint');
  await page.setViewportSize({width:1440,height:900});
  for(const mode of ['light','dark','system']) {
    await page.getByRole('button',{name:/^Theme:/}).click();
    await page.getByRole('menuitemradio',{name:mode[0].toUpperCase()+mode.slice(1),exact:true}).click();
    await page.emulateMedia({colorScheme:'dark'});
    for(let refresh=0;refresh<10;refresh++) {
      await page.reload();await page.getByRole('button',{name:`Theme: ${mode}`,exact:true}).waitFor();
      assert.equal(await page.locator('html').getAttribute('data-theme'),mode==='system'?'dark':mode);
    }
    if(mode==='system') {
      await page.emulateMedia({colorScheme:'light'});
      await page.waitForFunction(()=>document.documentElement.dataset.theme==='light');
    }
    console.log(`${mode.toUpperCase()}_REFRESH_10X=LOCAL_COMPONENT_PASS`);
  }
  console.log(`COMPONENT_CHECKS=PASS (${checks} width/motion checks; collapse, persistence, tooltip, reduced motion)`);
} finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await browser.close();clearTimeout(deadline);}
