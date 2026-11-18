// Optional browser regression, with a running local app and Playwright available on NODE_PATH.
// node scripts/check-study-layout.cjs http://127.0.0.1:3000
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const base = new URL(process.argv[2] || 'http://127.0.0.1:3000');
assert.ok(['localhost', '127.0.0.1'].includes(base.hostname));

async function check(browser, viewport, library) {
  const page = await browser.newPage({ viewport });
  try {
    await page.addInitScript(() => {
      const makeMessage = (role, content, id) => ({role, content, id, createdAt: new Date(0).toISOString(), attachments: [], citations: [], toolTrace: []});
      const history = [makeMessage('user', '第一题', 'q1'), makeMessage('assistant', '第一轮\n\n' + '解释与案例。\n\n'.repeat(160) + 'a'.repeat(600), 'a1')];
      const conversation = {id:'qa', title:'示例长对话', updatedAt:new Date(0).toISOString(), messageCount:2};
      let settled = false;
      let sent = false;
      const json = data => Promise.resolve(Response.json(data));
      const actualFetch = window.fetch;
      window.fetch = async (input, init) => {
        const path = new URL(typeof input === 'string' ? input : input.url, location.href).pathname;
        if (!path.startsWith('/api/')) return actualFetch(input, init);
        if (path === '/api/auth/session') return json({mode:'legacy'});
        if (path === '/api/study/qa') return json({messages:history});
        if (path === '/api/study' && init?.method !== 'POST') {
          if (settled) await new Promise(resolve => { window.qaFinishList = resolve; });
          return json({conversations:[conversation]});
        }
        if (path === '/api/study/stream' || (path === '/api/study' && init?.method === 'POST')) {
          if (sent) throw Error('duplicate send');
          sent = true;
          const messages = [...history, makeMessage('user','第二题','q2'), makeMessage('assistant','第二轮答复','a2')];
          const payload = {conversationId:'qa',messages,memorySummary:''};
          if (path === '/api/study') return new Promise(resolve => { window.qaDone = () => { settled = true; resolve(Response.json(payload)); }; });
          return new Response(new ReadableStream({start(controller) {
            const emit = data => controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`));
            window.qaDelta = text => emit({type:'delta', text});
            window.qaDone = () => { settled = true; emit({type:'done', ...payload}); controller.close(); };
          }}));
        }
        return json({documents:[], jobs:[], templates:[]});
      };
    });
    await page.goto(base.href);
    await page.getByRole('button',{name:'复习对话'}).click();
    await page.getByRole('button',{name:/示例长对话/}).first().click();
    const bubbles = page.locator('.study-thread > .study-bubble');
    await bubbles.nth(1).waitFor();
    if (library) await page.getByRole('group',{name:'对话模式'}).getByRole('button',{name:'知识库'}).click();
    await page.locator('.study-composer textarea').fill('第二题');
    await page.getByRole('button',{name:'发送',exact:true}).click();
    await page.locator('.study-bubble.pending').waitFor();
    const geometry = () => page.evaluate(() => {
      const thread = document.querySelector('.study-thread');
      const composer = document.querySelector('.study-composer').getBoundingClientRect();
      const rects = [...thread.querySelectorAll('.study-bubble')].map(el => el.getBoundingClientRect());
      return { scrollable:thread.scrollHeight > thread.clientHeight, bottom:thread.scrollHeight - thread.scrollTop - thread.clientHeight,
        composerVisible:composer.bottom <= innerHeight + 2 && composer.top >= thread.getBoundingClientRect().bottom - 1,
        ordered:rects.every((r,i) => !i || r.top >= rects[i-1].bottom - 1), widthFits:thread.scrollWidth <= thread.clientWidth + 1,
        pageFits:document.documentElement.scrollHeight <= innerHeight + 2 };
    });
    const checkLayout = async () => {
      const g = await geometry();
      assert.ok(g.scrollable && g.composerVisible && g.ordered && g.widthFits && g.pageFits, JSON.stringify(g));
      assert.ok(g.bottom < 4, `not following: ${g.bottom}`);
    };
    await checkLayout();
    assert.deepEqual(await bubbles.evaluateAll(items => items.map(x => x.classList.contains('user') ? 'user' : 'assistant')), ['user','assistant','user','assistant']);
    assert.match(await bubbles.nth(2).innerText(), /第二题/);
    if (!library) {
      await page.evaluate(() => window.qaDelta('正在回答。'.repeat(150)));
      await page.locator('.study-bubble.streaming').waitFor();
      await checkLayout();
      await page.locator('.study-thread').evaluate(t => { t.scrollTop = 100; });
      await page.waitForFunction(() => document.querySelector('.study-thread').scrollTop === 100);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await page.evaluate(() => window.qaDelta('继续分析。'.repeat(200)));
      await page.waitForFunction(() => document.querySelector('.streaming')?.textContent.includes('继续分析'));
      assert.ok(Math.abs(await page.locator('.study-thread').evaluate(t => t.scrollTop) - 100) < 3, 'lost reading position');
      await page.locator('.study-thread').evaluate(t => { t.scrollTop = t.scrollHeight; });
    }
    await page.evaluate(() => window.qaDone());
    await page.waitForFunction(() => !!window.qaFinishList);
    assert.equal(await bubbles.count(), 4, 'pending bubble reappeared after final answer');
    await page.evaluate(() => window.qaFinishList());
    await checkLayout();
    console.log(`PASS ${viewport.width}x${viewport.height} ${library ? 'retrieval' : 'stream'}`);
  } finally { await page.close(); }
}

(async () => {
  const browser = await chromium.launch({ channel:'chrome', headless:true });
  try {
    for (const viewport of [{width:1280,height:800},{width:390,height:844}]) {
      for (const library of [false,true]) await check(browser, viewport, library);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
