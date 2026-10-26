from pathlib import Path
import json
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'video' / 'assets'
OUT.mkdir(parents=True, exist_ok=True)
layouts = {}
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={'width':1920,'height':1080}, device_scale_factor=1)
    context.add_init_script("localStorage.setItem('shukan.onboarding.v3',JSON.stringify({dismissed:true}));localStorage.setItem('shukan.intro.v1','seen');")
    page = context.new_page()
    def capture(name, selectors):
        page.screenshot(path=str(OUT / f'{name}.png'))
        layouts[name] = {}
        for label, selector in selectors.items():
            loc = page.locator(selector).first
            if loc.count() and loc.is_visible():
                layouts[name][label] = loc.bounding_box()
        print(name, json.dumps(layouts[name], ensure_ascii=False), flush=True)
    def full(name):
        page.screenshot(path=str(OUT / f'{name}-full.png'), full_page=True)
    page.goto('http://127.0.0.1:8787/', wait_until='networkidle')
    page.locator('.atlas-svg').wait_for()
    page.wait_for_timeout(500)
    capture('nation', {'map':'.nation-atlas','search':'.nation-search-wrap','regions':'.atlas-region-tabs'})
    page.get_by_role('combobox',name='搜索已接入城市').fill('深圳')
    capture('search', {'search':'.nation-search-wrap','result':'.nation-search-results'})
    page.get_by_role('option').first.click()
    page.locator('.map-status').wait_for()
    page.wait_for_timeout(4500)
    full('overview')
    page.evaluate('window.scrollTo(0,450)')
    capture('overview', {'map':'.map-panel','insight':'.insight-panel','metrics':'.metric-strip','navigation':'.city-panel'})
    page.locator('.insight-panel').evaluate('(e)=>e.scrollTop=200')
    capture('history', {'history':'.history-section','insight':'.insight-panel'})
    for city in ['深圳','广州','佛山']:
        button=page.get_by_role('button', name='加入'+city+'对比', exact=True)
        if button.count(): button.click()
    page.locator('.compare-button').click()
    page.locator('dialog[open]').wait_for()
    capture('compare', {'dialog':'dialog[open]','table':'.comparison-table'})
    page.get_by_role('button',name='关闭弹窗',exact=True).click()
    page.get_by_role('button', name='发展推演快捷入口').click()
    page.get_by_role('button',name='积极',exact=True).click()
    page.wait_for_timeout(500)
    page.evaluate('window.scrollTo(0,500)')
    capture('scenario', {'controls':'.insight-panel','slider':'.growth-control','timeline':'.bottom-panel'})
    page.locator('.bottom-panel').scroll_into_view_if_needed()
    capture('scenario-detail', {'controls':'.insight-panel','timeline':'.bottom-panel'})
    page.get_by_role('button',name='气象洞察快捷入口').click()
    page.evaluate('window.scrollTo(0,0)')
    page.wait_for_timeout(3500)
    page.evaluate('window.scrollTo(0,420)')
    capture('weather', {'weather':'.insight-panel','forecast':'.bottom-panel'})
    page.get_by_role('button',name='查看数据来源',exact=True).click()
    capture('sources', {'dialog':'dialog[open]'})
    (OUT/'layout.json').write_text(json.dumps(layouts,ensure_ascii=False,indent=2),encoding='utf-8')
    context.close()
    browser.close()
