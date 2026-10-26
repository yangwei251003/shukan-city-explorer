from pathlib import Path
from playwright.sync_api import sync_playwright

root=Path(__file__).resolve().parents[1]
out=root/'video'/'assets'
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    context=browser.new_context(viewport={'width':1920,'height':1080},device_scale_factor=3)
    context.add_init_script("localStorage.setItem('shukan.onboarding.v3',JSON.stringify({dismissed:true}));localStorage.setItem('shukan.intro.v1','seen');")
    page=context.new_page()
    page.goto('http://127.0.0.1:8787/#/prd/overview/440300',wait_until='networkidle')
    page.locator('.history-section').wait_for()
    page.locator('.history-section').screenshot(path=str(out/'history-card.png'))
    page.get_by_role('button',name='气象洞察快捷入口').click()
    page.wait_for_timeout(2500)
    page.locator('.insight-panel').screenshot(path=str(out/'weather-card.png'))
    page.get_by_role('button',name='发展推演快捷入口').click()
    page.get_by_role('button',name='积极',exact=True).click()
    page.locator('.insight-panel').screenshot(path=str(out/'scenario-card.png'))
    browser.close()
print('3x detail screenshots ready',flush=True)
