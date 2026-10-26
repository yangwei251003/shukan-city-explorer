from pathlib import Path
import json
from playwright.sync_api import sync_playwright

root=Path(__file__).resolve().parents[1]
out=root/'artifacts'/'product-intro'
out.mkdir(parents=True,exist_ok=True)
results=[]
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    context=browser.new_context(viewport={'width':1440,'height':1000})
    page=context.new_page()
    errors=[]
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto('http://127.0.0.1:8787/',wait_until='networkidle')
    dialog=page.locator('.product-intro-card')
    dialog.wait_for()
    assert page.locator('.main-shell').get_attribute('inert') is not None
    page.screenshot(path=str(out/'desktop-welcome.png'))
    results.append('首次显示视频/漫游/自主探索入口，背景inert')
    page.get_by_role('button',name='关于团队',exact=True).click()
    assert page.locator('.pi-role').count()==5
    page.screenshot(path=str(out/'desktop-team.png'))
    results.append('五人岗位介绍显示，队长负责项目统筹')
    page.get_by_role('button',name='初次见面',exact=True).click()
    page.get_by_role('button',name='带我逛一逛',exact=False).click()
    page.wait_for_timeout(400)
    assert page.locator('.pi-vortex').count()==1
    page.screenshot(path=str(out/'vortex-midpoint.png'))
    page.wait_for_timeout(650)
    page.get_by_role('dialog',name='使用指南第1步').wait_for()
    assert page.locator('.product-intro-card').count()==0
    page.screenshot(path=str(out/'tour-first-step.png'))
    results.append('漩涡回收完成后才开始五步引导，无重叠弹窗')
    page.keyboard.press('Escape')
    page.locator('#product-intro-entry').click()
    page.get_by_role('button',name='介绍影片',exact=True).click()
    assert page.locator('video').get_attribute('preload')=='none'
    assert page.locator('video').get_attribute('autoplay') is None
    page.screenshot(path=str(out/'desktop-film.png'))
    page.locator('video').evaluate('(v)=>{v.muted=true;window.introPlaybackPaused=false;v.addEventListener("pause",()=>window.introPlaybackPaused=true,{once:true});return v.play()}')
    page.wait_for_function('document.querySelector("video").currentTime>.2')
    page.get_by_role('button',name='现在去试试',exact=False).click()
    page.get_by_role('dialog',name='使用指南第1步').wait_for()
    assert page.locator('video').count()==0
    assert page.evaluate('window.introPlaybackPaused===true')
    assert page.evaluate('Number(localStorage.getItem("shukan.intro.playback.v1"))>0')
    results.append('播放中转向漫游立即暂停并保存进度，收起后无残留播放器')
    page.keyboard.press('Escape')
    page.locator('#product-intro-entry').click()
    page.get_by_role('button',name='介绍影片',exact=True).click()
    page.keyboard.press('Escape')
    page.locator('.product-intro-card').wait_for(state='detached',timeout=15000)
    page.wait_for_timeout(150)
    focused=page.evaluate('({id:document.activeElement.id,tag:document.activeElement.tagName,label:document.activeElement.getAttribute("aria-label"),html:document.activeElement.outerHTML.slice(0,400)})')
    print('Focus after close:',focused,flush=True)
    assert focused['id']=='product-intro-entry',focused
    page.reload(wait_until='networkidle')
    assert page.locator('.product-intro-card').count()==0
    results.append('关闭后恢复焦点，刷新不再打断；视频不自动播放')
    mobile=browser.new_context(viewport={'width':390,'height':844},reduced_motion='reduce',is_mobile=True,has_touch=True)
    m=mobile.new_page()
    m.on('pageerror',lambda e:errors.append(str(e)))
    m.goto('http://127.0.0.1:8787/',wait_until='networkidle')
    m.locator('.product-intro-card').wait_for()
    assert m.evaluate('document.documentElement.scrollWidth <= innerWidth')
    m.screenshot(path=str(out/'mobile-welcome.png'))
    m.get_by_role('button',name='我想自己探索',exact=False).click()
    m.wait_for_timeout(300)
    assert m.locator('.product-intro-card').count()==0
    assert m.locator('.mobile-intro-entry').is_visible()
    m.locator('.mobile-intro-entry').click()
    m.get_by_role('button',name='关于团队',exact=True).click()
    assert m.locator('.pi-role').count()==5
    m.screenshot(path=str(out/'mobile-team.png'))
    results.append('390px手机无横溢出，可重开介绍，减少动态效果短淡出')
    assert not errors,errors
    results.append('受测流程无浏览器运行错误')
    browser.close()
(out/'ui-results.json').write_text(json.dumps({'checks':results,'errors':errors},ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(results,ensure_ascii=False,indent=2))
