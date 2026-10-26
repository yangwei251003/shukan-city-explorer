from pathlib import Path
from playwright.sync_api import sync_playwright
out=Path(__file__).resolve().parents[1]/'video'/'assets'
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    context=browser.new_context(viewport={'width':1920,'height':1080})
    context.add_init_script("localStorage.setItem('shukan.onboarding.v3',JSON.stringify({dismissed:true}));localStorage.setItem('shukan.intro.v1','seen');")
    page=context.new_page()
    page.goto('http://127.0.0.1:8787/#/prd/overview/440300',wait_until='networkidle')
    page.locator('.compare-button').wait_for()
    for city in ['佛山','深圳','广州']:
        desired='取消' if city=='佛山' else '加入'
        btn=page.get_by_role('button',name=desired+city+'对比',exact=True)
        if btn.count():btn.click()
    page.locator('.compare-button').click()
    page.locator('dialog[open]').wait_for()
    page.screenshot(path=str(out/'compare-two.png'))
    page.get_by_role('button',name='关闭弹窗',exact=True).click()
    page.get_by_role('button',name='发展推演快捷入口').click()
    page.get_by_role('button',name='审慎',exact=True).click()
    page.locator('.bottom-panel').scroll_into_view_if_needed()
    page.screenshot(path=str(out/'scenario-detail-b.png'))
    context.close()
    browser.close()
print('two-city and alternate-scenario screenshots ready')
