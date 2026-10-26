from pathlib import Path
import json
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
out=root/'artifacts'/'product-intro'
checks=[]
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    context=browser.new_context(viewport={'width':1440,'height':1000})
    page=context.new_page()
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    media_requests=[]
    page.on('request',lambda r:media_requests.append(r.url) if '.mp4' in r.url else None)
    page.goto('http://127.0.0.1:8787/',wait_until='networkidle')
    page.locator('.product-intro-card').wait_for()
    assert not media_requests
    page.screenshot(path=str(out/'desktop-welcome.png'))
    page.get_by_role('button',name='介绍影片',exact=True).click()
    page.wait_for_timeout(200)
    assert not media_requests
    player=page.locator('video')
    player.evaluate('(v)=>{v.muted=true;return v.play()}')
    page.wait_for_function('document.querySelector("video").currentTime > .5')
    metadata=player.evaluate('(v)=>({duration:v.duration,width:v.videoWidth,height:v.videoHeight,paused:v.paused,error:v.error,tracks:[...v.textTracks].map(t=>t.mode)})')
    assert abs(metadata['duration']-102.333)<.2 and metadata['width']==1920 and metadata['height']==1080 and metadata['error'] is None
    assert all(t!='showing' for t in metadata['tracks'])
    player.evaluate('(v)=>v.pause()')
    page.get_by_role('button',name='给未来一个假设',exact=False).click()
    page.wait_for_function('Math.abs(document.querySelector("video").currentTime-59.12)<.15')
    page.wait_for_function('!document.querySelector("video").seeking && document.querySelector("video").readyState>=2')
    page.screenshot(path=str(out/'desktop-film.png'))
    page.get_by_role('button',name='关于团队',exact=True).click()
    assert page.locator('.pi-role').count()==5
    page.screenshot(path=str(out/'desktop-team.png'))
    page.keyboard.press('Escape')
    page.locator('.product-intro-card').wait_for(state='detached')
    saved=page.evaluate('Number(localStorage.getItem("shukan.intro.playback.v1"))')
    assert abs(saved-59.12)<.15
    page.reload(wait_until='networkidle')
    assert page.locator('.product-intro-card').count()==0
    page.locator('#product-intro-entry').click()
    page.get_by_role('button',name='介绍影片',exact=True).click()
    page.get_by_role('button',name='关于团队',exact=True).click()
    assert abs(page.evaluate('Number(localStorage.getItem("shukan.intro.playback.v1"))')-59.12)<.15
    page.get_by_role('button',name='介绍影片',exact=True).click()
    page.locator('video').evaluate('(v)=>v.load()')
    page.wait_for_function('Math.abs(document.querySelector("video").currentTime-59.12)<.15')
    checks+=['首访/影片页未点击播放前无MP4请求','1080p H.264在浏览器实际播放','章节定位与持久续播有效','未加载metadata直接离开不清零进度','烧录字幕与VTT无重复显示']
    mobile=browser.new_context(viewport={'width':390,'height':844},reduced_motion='reduce',is_mobile=True,has_touch=True)
    m=mobile.new_page()
    m.on('pageerror',lambda e:errors.append(str(e)))
    m.goto('http://127.0.0.1:8787/',wait_until='networkidle')
    m.locator('.product-intro-card').wait_for()
    assert m.evaluate('document.documentElement.scrollWidth <= innerWidth')
    m.screenshot(path=str(out/'mobile-welcome.png'))
    m.get_by_role('button',name='我想自己探索',exact=False).click()
    m.locator('.product-intro-card').wait_for(state='detached')
    assert m.locator('.mobile-intro-entry').is_visible()
    m.locator('.mobile-intro-entry').click()
    m.get_by_role('button',name='关于团队',exact=True).click()
    m.screenshot(path=str(out/'mobile-team.png'))
    assert m.locator('.pi-role').count()==5
    m.get_by_role('button',name='介绍影片',exact=True).click()
    m.screenshot(path=str(out/'mobile-film.png'))
    assert m.evaluate('document.documentElement.scrollWidth <= innerWidth')
    checks+=['390px手机欢迎/团队/影片页无横向溢出','手机重开入口可见','减少动态效果模式完成退出']
    assert not errors,errors
    checks+=['浏览器无运行错误']
    result={'checks':checks,'metadata':metadata,'errors':errors}
    (out/'media-ui-results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(result,ensure_ascii=False,indent=2))
    browser.close()
