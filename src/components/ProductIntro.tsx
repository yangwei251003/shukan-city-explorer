import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDownToLine, ArrowRight, Check, ChevronRight, Compass, Film, Globe2, Layers3, MapPinned, Play, Users, X } from 'lucide-react';

export type ProductIntroProps = {
  open: boolean;
  onClose: () => void;
  onStartTour: () => void;
  onExplore: () => void;
};

type View = 'welcome' | 'film' | 'team';
type ExitAction = 'close' | 'tour' | 'explore';
const PLAYBACK_KEY = 'shukan.intro.playback.v1';
const chapters = [
  { time: 0, title: '从一个问题出发', note: '认识数瞰' },
  { time: 9, title: '把视线放到全国', note: '全国探索' },
  { time: 19.45, title: '找到想看的城市', note: '搜索城市' },
  { time: 28.12, title: '走近一座城市', note: '城市总览' },
  { time: 39.12, title: '把城市放在一起', note: '城市比较' },
  { time: 50.12, title: '沿着时间回望', note: '历史变化' },
  { time: 59.12, title: '给未来一个假设', note: '发展情景' },
  { time: 71.42, title: '看看此刻的天气', note: '城市天气' },
  { time: 80.09, title: '带着依据继续探索', note: '来源与导出' },
];
const roles = [
  { number: '01', name: '杨炜晨', title: '队长 · 项目统筹', subtitle: '方向、协作与整体交付', duties: '负责产品方向与需求取舍，协调成员分工，统筹版本整合、作品展示及答辩。', icon: Compass },
  { number: '02', name: '翁宇航', title: '产品与交互策划', subtitle: '探索路径与内容组织', duties: '负责信息层级、城市检索与对比的操作路径，梳理引导逻辑、界面文案和使用说明。', icon: Layers3 },
  { number: '03', name: '陈立军', title: '前端与地图交互', subtitle: '界面、地图与终端适配', duties: '负责界面模块、地图与图表交互、响应式布局，对接实景查看器及使用反馈。', icon: MapPinned },
  { number: '04', name: '郭宇', title: '数据与服务逻辑', subtitle: '统计口径与可追溯来源', duties: '负责数据来源与统计口径核对、版本组织、情景计算及本地服务接口。', icon: Globe2 },
  { number: '05', name: '林纳川', title: '视觉、质量与答辩', subtitle: '视觉规范与成果呈现', duties: '负责视觉规范与展示素材，组织功能及页面检查，编制答辩图文与讲解内容。', icon: Check },
];

function readPlaybackTime() {
  let stored: string | null = null;
  try { stored = localStorage.getItem(PLAYBACK_KEY); } catch { /* Fall back to this session when persistent storage is unavailable. */ }
  if (stored === null) try { stored = sessionStorage.getItem(PLAYBACK_KEY); } catch { /* Storage is optional. */ }
  const time = Number(stored);
  return Number.isFinite(time) && time > 0 ? time : 0;
}

function persistPlaybackTime(time: number) {
  try { localStorage.setItem(PLAYBACK_KEY, String(time)); }
  catch { try { sessionStorage.setItem(PLAYBACK_KEY, String(time)); } catch { /* In-memory playback still works. */ } }
}

function timeLabel(time: number) {
  return `${Math.floor(time / 60).toString().padStart(2, '0')}:${Math.floor(time % 60).toString().padStart(2, '0')}`;
}

export default function ProductIntro({ open, onClose, onStartTour, onExplore }: ProductIntroProps) {
  const [view, setView] = useState<View>('welcome');
  const [closing, setClosing] = useState(false);
  const [currentTime, setCurrentTime] = useState(readPlaybackTime);
  const [videoError, setVideoError] = useState(false);
  const [sink, setSink] = useState<{ x: number; y: number } | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const card = useRef<HTMLDivElement>(null);
  const backdrop = useRef<HTMLDivElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const focusBefore = useRef<HTMLElement | null>(null);
  const restoreFocusPending = useRef(false);
  const savedTime = useRef(currentTime);
  const lastPersistedTime = useRef(currentTime);
  const pendingSeek = useRef<number | null>(null);
  const exiting = useRef(false);
  const exitAction = useRef<ExitAction | null>(null);
  const animations = useRef<Animation[]>([]);
  const fallbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animationRun = useRef(0);
  const callbacks = useRef({ onClose, onStartTour, onExplore });
  const exitHandler = useRef<(action: ExitAction) => void>(() => {});
  callbacks.current = { onClose, onStartTour, onExplore };

  function savePlayback() {
    const player = video.current;
    if (player && player.readyState >= 1 && pendingSeek.current === null && Number.isFinite(player.currentTime)) savedTime.current = player.currentTime;
    persistPlaybackTime(savedTime.current);
    lastPersistedTime.current = savedTime.current;
  }

  function pausePlayback() {
    savePlayback();
    video.current?.pause();
  }

  function changeView(next: View) {
    if (exiting.current) return;
    if (next !== 'film') pausePlayback();
    setView(next);
    setAnnouncement('');
  }

  function seekTo(time: number) {
    const player = video.current;
    if (!player || exiting.current) return;
    pendingSeek.current = time;
    savedTime.current = time;
    setCurrentTime(time);
    if (player.readyState >= 1) {
      player.currentTime = Math.min(time, Number.isFinite(player.duration) ? Math.max(0, player.duration - .1) : time);
      pendingSeek.current = null;
    } else player.load();
    setAnnouncement(`已定位到 ${timeLabel(time)}，按播放继续观看。`);
    persistPlaybackTime(time);
    lastPersistedTime.current = time;
  }

  function restorePlayback() {
    const player = video.current;
    if (!player) return;
    const requested = pendingSeek.current ?? savedTime.current;
    const completed = Number.isFinite(player.duration) && player.duration > 0 && requested >= player.duration - .5;
    const restored = completed ? 0 : Math.min(requested, Number.isFinite(player.duration) ? Math.max(0, player.duration - .1) : requested);
    if (requested > 0) player.currentTime = restored;
    savedTime.current = restored;
    setCurrentTime(restored);
    if (completed) { persistPlaybackTime(0); lastPersistedTime.current = 0; }
    pendingSeek.current = null;
  }

  function absorb(action: ExitAction) {
    if (exiting.current || !open) return;
    exiting.current = true;
    exitAction.current = action;
    pausePlayback();
    setClosing(true);
    setAnnouncement('影片已收好，随时可以从“认识数瞰”继续观看。');
    const run = ++animationRun.current;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const entry = [document.getElementById('product-intro-entry'), ...document.querySelectorAll<HTMLElement>('[data-product-intro-entry]')]
      .find(element => element && element.getBoundingClientRect().width > 0 && element.getBoundingClientRect().height > 0);
    const sourceRect = card.current?.getBoundingClientRect();
    const targetRect = entry?.getBoundingClientRect();
    const hasTarget = !!sourceRect && !!targetRect;
    const duration = reducedMotion || !hasTarget ? 180 : 850;
    const finish = () => {
      if (animationRun.current !== run) return;
      setClosing(false);
      setSink(null);
      if (action === 'tour') callbacks.current.onStartTour();
      else if (action === 'explore') callbacks.current.onExplore();
      else callbacks.current.onClose();
    };
    const track = (element: HTMLElement | null, keyframes: Keyframe[], options: KeyframeAnimationOptions) => {
      if (!element?.animate) return null;
      const animation = element.animate(keyframes, options);
      animations.current.push(animation);
      return animation;
    };
    if (!reducedMotion && sourceRect && targetRect) {
      const x = targetRect.x + targetRect.width / 2;
      const y = targetRect.y + targetRect.height / 2;
      const dx = x - (sourceRect.x + sourceRect.width / 2);
      const dy = y - (sourceRect.y + sourceRect.height / 2);
      const bend = Math.max(-100, Math.min(100, -dy * .18 - 55));
      setSink({ x, y });
      track(card.current, [
        { offset: 0, transform: 'translate(0, 0) rotate(0deg) scale(1)', opacity: 1, borderRadius: '20px', filter: 'blur(0px)' },
        { offset: .25, transform: `translate(${dx * .12}px, ${dy * .12 + bend}px) rotate(-3deg) scale(.92)`, opacity: 1, borderRadius: '32px', filter: 'blur(0px)' },
        { offset: .61, transform: `translate(${dx * .57}px, ${dy * .5 + bend}px) rotate(-18deg) scale(.48)`, opacity: .97, borderRadius: '70px', filter: 'blur(0px)' },
        { offset: .84, transform: `translate(${dx * .91}px, ${dy * .87}px) rotate(-90deg) scale(.13)`, opacity: .85, borderRadius: '45%', filter: 'blur(1px)' },
        { offset: 1, transform: `translate(${dx}px, ${dy}px) rotate(-255deg) scale(.015)`, opacity: 0, borderRadius: '50%', filter: 'blur(5px)' },
      ], { duration, easing: 'cubic-bezier(.32,0,.32,1)', fill: 'forwards' });
    } else track(card.current, [{ opacity: 1 }, { opacity: 0 }], { duration, fill: 'forwards' });
    track(backdrop.current, [{ opacity: 1 }, { opacity: 0 }], { duration, easing: 'ease-in', fill: 'forwards' });
    const movement = animations.current[0];
    if (movement) void movement.finished.then(finish, () => {});
    else fallbackTimer.current = setTimeout(finish, duration);
  }
  exitHandler.current = absorb;

  useEffect(() => {
    if (!open) {
      if (!restoreFocusPending.current) return;
      const frame = requestAnimationFrame(() => {
        restoreFocusPending.current = false;
        const previous = focusBefore.current;
        const entry = [document.getElementById('product-intro-entry'), ...document.querySelectorAll<HTMLElement>('[data-product-intro-entry]')]
          .find(element => element && element.getClientRects().length > 0);
        const candidate = previous?.isConnected && previous !== document.body && previous.getClientRects().length > 0 && !previous.closest('[inert]') ? previous : entry;
        if (candidate?.isConnected && !candidate.closest('[inert]')) candidate.focus({ preventScroll: true });
      });
      return () => cancelAnimationFrame(frame);
    }
    restoreFocusPending.current = false;
    const active = document.activeElement;
    focusBefore.current = active instanceof HTMLElement ? active : null;
    exiting.current = false;
    exitAction.current = null;
    setClosing(false);
    setSink(null);
    setView('welcome');
    setVideoError(false);
    setAnnouncement('');
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        exitHandler.current('close');
      }
      if (event.key !== 'Tab') return;
      if (exiting.current) { event.preventDefault(); return; }
      const elements = Array.from(card.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], video[controls], [tabindex="0"]') ?? [])
        .filter(element => element.getClientRects().length > 0 && !element.closest('[inert]'));
      if (!elements.length) { event.preventDefault(); return; }
      const first = elements[0];
      const last = elements[elements.length - 1];
      const current = document.activeElement;
      if (event.shiftKey && (current === first || !elements.includes(current as HTMLElement))) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (current === last || !card.current?.contains(current))) {
        event.preventDefault(); first.focus();
      }
    };
    const saveWhenHidden = () => { if (document.visibilityState === 'hidden') savePlayback(); };
    document.addEventListener('keydown', keydown, true);
    document.addEventListener('visibilitychange', saveWhenHidden);
    window.addEventListener('pagehide', savePlayback);
    return () => {
      ++animationRun.current;
      pausePlayback();
      animations.current.forEach(animation => animation.cancel());
      animations.current = [];
      if (fallbackTimer.current !== null) clearTimeout(fallbackTimer.current);
      fallbackTimer.current = null;
      document.removeEventListener('keydown', keydown, true);
      document.removeEventListener('visibilitychange', saveWhenHidden);
      window.removeEventListener('pagehide', savePlayback);
      document.body.style.overflow = previousOverflow;
      // Wait until the parent has removed inert. A newly opened tour owns its own focus.
      restoreFocusPending.current = exitAction.current !== 'tour';
    };
  }, [open]);

  useEffect(() => {
    if (!open || closing) return;
    const frame = requestAnimationFrame(() => title.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [view, open, closing]);

  if (!open) return null;
  const activeChapter = chapters.reduce((active, chapter, index) => currentTime >= chapter.time ? index : active, 0);

  return createPortal(<div className={`product-intro-layer${closing ? ' is-closing' : ''}`}>
    <div className="product-intro-backdrop" ref={backdrop} aria-hidden="true" />
    <div className="product-intro-card" ref={card} role="dialog" aria-modal="true" aria-labelledby="product-intro-title" aria-describedby="product-intro-description" aria-busy={closing}>
      <header className="pi-header">
        <div className="pi-brand"><span className="pi-brand-symbol" aria-hidden="true"><svg viewBox="0 0 32 32"><path d="M5 5c14 4-3 18 8 22M15 5c14 4-3 18 8 22M25 5c10 4-4 13-1 18" /></svg></span><span>数瞰<small>认识城市，从这里开始</small></span></div>
        <nav className="pi-tabs" aria-label="介绍内容">
          <button type="button" aria-current={view === 'welcome' ? 'page' : undefined} disabled={closing} onClick={() => changeView('welcome')}>初次见面</button>
          <button type="button" aria-current={view === 'film' ? 'page' : undefined} disabled={closing} onClick={() => changeView('film')}>介绍影片</button>
          <button type="button" aria-current={view === 'team' ? 'page' : undefined} disabled={closing} onClick={() => changeView('team')}>关于团队</button>
        </nav>
        <button type="button" className="pi-close" aria-label="收起介绍，继续探索" title="收回侧栏" disabled={closing} onClick={() => absorb('close')}><X size={20} /></button>
      </header>

      <div className={`pi-content pi-content-${view}`} inert={closing}>
        {view === 'welcome' && <>
          <button type="button" className="pi-poster" onClick={() => changeView('film')} aria-label="打开数瞰介绍影片">
            <img src="/media/shukan-cover.jpg" alt="数瞰城市数据探索平台地图" />
            <span className="pi-poster-shade" />
            <span className="pi-poster-top"><span><i />城市有万千面貌</span><Film size={17} /></span>
            <span className="pi-play"><Play size={23} fill="currentColor" /></span>
            <span className="pi-poster-caption"><small>A CLOSER LOOK AT OUR CITIES</small><strong>看见城市。<br />也看见它的可能。</strong><span>观看数瞰介绍影片 <ArrowRight size={17} /></span></span>
          </button>
          <section className="pi-welcome-copy">
            <span className="pi-eyebrow">很高兴，在这里遇见你</span>
            <h1 id="product-intro-title" ref={title} tabIndex={-1}>一座城市，<br />值得多看一眼。</h1>
            <p id="product-intro-description">那些熟悉的地名背后，有怎样的生活与变化？<br className="pi-desktop-break" />从一张地图出发，让数据带我们走近一点。</p>
            <div className="pi-choices">
              <button type="button" className="pi-choice pi-choice-primary" onClick={() => changeView('film')}><span className="pi-choice-icon"><Play size={19} /></span><span><strong>先看一段介绍</strong><small>约 1 分 42 秒，认识数瞰能做什么</small></span><ArrowRight size={19} /></button>
              <button type="button" className="pi-choice" onClick={() => absorb('tour')}><span className="pi-choice-icon"><Compass size={20} /></span><span><strong>带我逛一逛</strong><small>五个小步骤，边操作边熟悉</small></span><ArrowRight size={19} /></button>
            </div>
            <button type="button" className="pi-explore" onClick={() => absorb('explore')}>我想自己探索 <ChevronRight size={15} /></button>
            <div className="pi-return-note"><span aria-hidden="true">↙</span><p>介绍会收在侧栏的“认识数瞰”里。<br />不着急，想看时再回来。</p></div>
          </section>
        </>}

        {view === 'film' && <>
          <div className="pi-section-heading"><div><span className="pi-eyebrow">跟着画面，走近城市</span><h1 id="product-intro-title" ref={title} tabIndex={-1}>让好奇，有迹可循。</h1><p id="product-intro-description">从全国格局到城市细节，按自己的节奏看一遍。</p></div><button type="button" className="pi-small-action" onClick={() => absorb('tour')}><Compass size={16} />现在去试试<ArrowRight size={15} /></button></div>
          <div className="pi-film-layout">
            <div className="pi-video-column">
              <div className="pi-video-frame"><video ref={video} src="/media/shukan-tour.mp4" poster="/media/shukan-poster.jpg" preload="none" controls playsInline onLoadedMetadata={restorePlayback} onLoadedData={() => setVideoError(false)} onTimeUpdate={event => { if (event.currentTarget.readyState < 1 || pendingSeek.current !== null) return; const time = event.currentTarget.currentTime; savedTime.current = time; setCurrentTime(time); if (Math.abs(time - lastPersistedTime.current) >= 2) { persistPlaybackTime(time); lastPersistedTime.current = time; } }} onPause={savePlayback} onEnded={() => setAnnouncement('影片看完了。接下来，选一座你想了解的城市吧。')} onError={() => setVideoError(true)} aria-label="数瞰网站介绍与操作演示"><track src="/media/shukan-tour.vtt" kind="subtitles" srcLang="zh" label="中文字幕" />你的浏览器暂时无法播放这段视频，可以下载后观看。</video></div>
              {videoError ? <p className="pi-video-message" role="status">影片暂时没有加载出来。你可以先阅读文字稿，或直接进入引导漫游。</p> : <p className="pi-video-hint"><span><i />中文旁白 · 中文字幕</span><span>看到哪儿，下次接着看</span></p>}
              <div className="pi-downloads"><a href="/media/shukan-tour.mp4" download><ArrowDownToLine size={14} />保存影片</a><a href="/media/shukan-transcript.txt" download>阅读文字稿<ArrowRight size={13} /></a><a href="/media/shukan-tour.vtt" download>字幕文件<ArrowDownToLine size={12} /></a></div>
              <p className="pi-music-credit">配乐：<a href="https://www.scottbuckley.com.au/library/horizons/" target="_blank" rel="noreferrer">Horizons — Scott Buckley</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a> · 已剪辑并混音</p>
            </div>
            <aside className="pi-chapters" aria-label="影片章节"><div className="pi-chapters-title"><span>想看哪一段？</span><small>CHAPTERS</small></div>{chapters.map((chapter, index) => <button type="button" key={chapter.time} onClick={() => seekTo(chapter.time)} aria-pressed={activeChapter === index}><span className="pi-chapter-time">{timeLabel(chapter.time)}</span><span><strong>{chapter.title}</strong><small>{chapter.note}</small></span><Play size={12} /></button>)}</aside>
          </div>
        </>}

        {view === 'team' && <>
          <div className="pi-section-heading pi-team-heading"><div><span className="pi-eyebrow">广州科技职业技术大学 · 数瞰团队</span><h1 id="product-intro-title" ref={title} tabIndex={-1}>让城市数据，更容易读懂。</h1><p id="product-intro-description">五位成员共同承担产品、交互、技术与展示工作。</p></div><span className="pi-team-mark" aria-hidden="true"><Users size={28} /><small>FIVE MINDS<br />ONE DIRECTION</small></span></div>
          <div className="pi-team-institution"><span><small>参赛院校</small><strong>广州科技职业技术大学</strong></span><span><small>指导教师</small><strong>陈毓秀<span className="pi-name-divider"> / </span>韦一文</strong></span></div>
          <div className="pi-team-grid">{roles.map((role, index) => <article key={role.number} className={index === 0 ? 'pi-role pi-role-lead' : 'pi-role'}><div className="pi-role-top"><span>{role.number}</span><role.icon size={19} /></div><h2>{role.name}</h2><h3>{role.title}</h3><p>{role.duties}</p></article>)}</div>
          <div className="pi-team-footnote"><span>产品、数据与表达，来自同一支团队的协作。</span><button type="button" onClick={() => absorb('explore')}>到城市里看看<ArrowRight size={15} /></button></div>
        </>}
      </div>
      <footer className="pi-footer"><span><i /> 数瞰 · 中国城市群数据探索平台</span><span>有依据地观察，有边界地推演。</span></footer>
    </div>
    {sink && <div className="pi-vortex" style={{ left: sink.x, top: sink.y }} aria-hidden="true"><span className="pi-vortex-ring" /><span className="pi-vortex-ring pi-vortex-ring-inner" /><span className="pi-vortex-light" /><span className="pi-vortex-pulse" /></div>}
    <span className="pi-screen-reader" role="status" aria-live="polite">{announcement}</span>
  </div>, document.body);
}
