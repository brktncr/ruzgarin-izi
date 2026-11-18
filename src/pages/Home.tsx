import { useEffect, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { SplashScreen } from '@capacitor/splash-screen'
import { StatusBar, Style } from '@capacitor/status-bar'
import { App as CapacitorApp } from '@capacitor/app'
import { KeepAwake } from '@capacitor-community/keep-awake'
import {
  BookOpen,
  ChevronRight,
  CloudRain,
  Droplets,
  Flower2,
  Gauge,
  Heart,
  Home as HomeIcon,
  Maximize2,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  TreePine,
  Volume2,
  VolumeX,
  Waves,
  Wheat,
  X,
  Zap,
} from 'lucide-react'
import { GameEngine } from '../game/engine'
import { formatTime, INITIAL_SNAPSHOT, LANDMARKS } from '../game/config'
import type { Snapshot, Tasks } from '../game/types'
import '../App.css'

const taskLabels: { id: keyof Tasks; label: string; short: string }[] = [
  { id: 'note', label: 'Kulübedeki notu oku', short: 'Not' },
  { id: 'fed', label: 'Atını besle', short: 'Yem' },
  { id: 'watered', label: 'Atına su ver', short: 'Su' },
  { id: 'brushed', label: 'Atını tara', short: 'Bakım' },
  { id: 'lake', label: 'Ayna Gölü’nü keşfet', short: 'Göl' },
  { id: 'tower', label: 'Gözcü Kulesi’ne git', short: 'Kule' },
  { id: 'meadow', label: 'Çiçekli Çayır’ı bul', short: 'Çayır' },
]

function Meter({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: string }) {
  return (
    <div className="meter" aria-label={`${label}: yüzde ${Math.round(value)}`}>
      <div className="meter-label">{icon}<span>{label}</span><b>{Math.round(value)}</b></div>
      <div className="meter-track"><i className={tone} style={{ width: `${value}%` }} /></div>
    </div>
  )
}

function TouchKey({ code, label, engine }: { code: string; label: string; engine?: GameEngine }) {
  return (
    <button
      className="touch-key"
      aria-label={label}
      onPointerDown={(event) => { event.preventDefault(); engine?.setKey(code, true) }}
      onPointerUp={() => engine?.setKey(code, false)}
      onPointerCancel={() => engine?.setKey(code, false)}
      onPointerLeave={() => engine?.setKey(code, false)}
    >{label}</button>
  )
}

function HoldKey({ code, glyph, caption, engine }: { code: string; glyph: string; caption: string; engine?: GameEngine }) {
  return (
    <button
      aria-label={caption}
      onPointerDown={(event) => { event.preventDefault(); engine?.setKey(code, true) }}
      onPointerUp={() => engine?.setKey(code, false)}
      onPointerCancel={() => engine?.setKey(code, false)}
      onPointerLeave={() => engine?.setKey(code, false)}
    >{glyph}<small>{caption}</small></button>
  )
}

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<GameEngine | undefined>(undefined)
  const [snapshot, setSnapshot] = useState<Snapshot>(INITIAL_SNAPSHOT)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [helpOpen, setHelpOpen] = useState(false)
  const [toastVisible, setToastVisible] = useState(false)

  useEffect(() => {
    if (!canvasRef.current) return
    const engine = new GameEngine(canvasRef.current, setSnapshot)
    engineRef.current = engine
    engine.init().then(() => setReady(true)).catch((reason) => {
      console.error(reason)
      setError(reason instanceof Error ? reason.message : '3B dünya başlatılamadı')
    })
    return () => {
      engine.dispose()
      engineRef.current = undefined
    }
  }, [])

  useEffect(() => {
    if (!snapshot.toastId) return
    setToastVisible(true)
    const timer = window.setTimeout(() => setToastVisible(false), 4200)
    return () => window.clearTimeout(timer)
  }, [snapshot.toastId])

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    StatusBar.setOverlaysWebView({ overlay: true }).catch(() => {})
    StatusBar.setStyle({ style: Style.Dark }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !ready) return
    SplashScreen.hide()
  }, [ready])

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    if (snapshot.phase === 'playing') KeepAwake.keepAwake().catch(() => {})
    else KeepAwake.allowSleep().catch(() => {})
  }, [snapshot.phase])

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    const handle = CapacitorApp.addListener('backButton', () => {
      if (helpOpen) { setHelpOpen(false); return }
      if (snapshot.phase === 'playing') engineRef.current?.pause()
      else if (snapshot.phase === 'paused') engineRef.current?.resume()
      else if (snapshot.phase === 'title') CapacitorApp.exitApp()
    })
    return () => { void handle.then((listener) => listener.remove()) }
  }, [snapshot.phase, helpOpen])

  const engine = engineRef.current
  const fullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void document.documentElement.requestFullscreen()
  }
  const completedBond = Math.round(snapshot.bond)
  return (
    <main className={`game-shell phase-${snapshot.phase}`}>
      <canvas ref={canvasRef} className="world-canvas" aria-label="Rüzgârın İzi etkileşimli üç boyutlu orman dünyası" />
      <div className="vignette" aria-hidden="true" />

      {!ready && !error && (
        <section className="loading-screen" aria-live="polite">
          <div className="loading-mark"><span /><span /><span /></div>
          <p className="eyebrow">AÇIK DÜNYA AT YAŞAMI</p>
          <h1>Rüzgârın İzi</h1>
          <p>Orman uyanıyor, eyer hazırlanıyor…</p>
        </section>
      )}

      {error && (
        <section className="modal-backdrop">
          <div className="paper-panel error-panel">
            <h2>Ormana ulaşılamadı</h2>
            <p>{error}</p>
            <p>Güncel bir Chrome, Edge, Firefox veya Safari sürümünde donanım hızlandırmayı etkinleştirip yeniden deneyin.</p>
            <button className="primary-button" onClick={() => location.reload()}><RotateCcw size={17} /> Yeniden dene</button>
          </div>
        </section>
      )}

      {ready && snapshot.phase === 'title' && (
        <section className="title-screen">
          <div className="title-copy">
            <p className="eyebrow">SERBEST STİL AT SÜRÜŞÜ</p>
            <h1>Rüzgârın<br /><em>İzi</em></h1>
            <p className="title-lead">Kulübenin kapısını arala. Atının bakımını üstlen, patikaları aş ve ormanın saklı duraklarını kendi ritminde keşfet.</p>
            <div className="title-actions">
              <button className="primary-button" onClick={() => engine?.start()}><Play size={18} fill="currentColor" /> Sürüşe başla <ChevronRight size={18} /></button>
              <button className="text-button" onClick={() => setHelpOpen(true)}><BookOpen size={17} /> Nasıl oynanır</button>
            </div>
            <div className="quick-controls" aria-label="Temel kontroller">
              <span><kbd>W A S D</kbd> Sürüş</span>
              <span><kbd>R</kbd> İn / bin</span>
              <span><kbd>E</kbd> Etkileşim</span>
              <span><kbd>Shift</kbd> Dörtnal</span>
            </div>
          </div>
          <div className="title-footer">
            <span>Gün {snapshot.day} · Sonbahar vadisi</span>
            <button onClick={() => setHelpOpen(true)}>Kontroller ve kaynaklar</button>
          </div>
        </section>
      )}

      {ready && ['playing', 'paused', 'summary'].includes(snapshot.phase) && (
        <>
          <header className="hud-top">
            <div className="hud-brand"><span className="brand-sigil">Rİ</span><div><b>RÜZGÂRIN İZİ</b><small>Gün {snapshot.day} · Vadi</small></div></div>
            <div className="time-pill"><span>{formatTime(snapshot.time)}</span><i /> <span>{snapshot.raining ? 'Yağmurlu' : snapshot.time > 19 || snapshot.time < 7 ? 'Alacakaranlık' : 'Açık'}</span></div>
            <div className="hud-actions">
              <button aria-label={snapshot.muted ? 'Sesi aç' : 'Sesi kapat'} onClick={() => engine?.setMuted(!snapshot.muted)}>{snapshot.muted ? <VolumeX /> : <Volume2 />}</button>
              <button aria-label="Tam ekran" onClick={fullscreen}><Maximize2 /></button>
              <button aria-label="Duraklat" onClick={() => engine?.pause()}><Pause /></button>
            </div>
          </header>

          <aside className="quest-panel">
            <div className="panel-heading"><span>GÜNÜN ROTASI</span><b>{snapshot.completed}/7</b></div>
            <div className="quest-list">
              {taskLabels.map((task) => (
                <div key={task.id} className={snapshot.tasks[task.id] ? 'quest done' : 'quest'}>
                  <i /> <span>{task.label}</span>
                </div>
              ))}
            </div>
          </aside>

          <aside className="minimap" aria-label="Vadi haritası">
            <div className="map-north">K</div>
            <div className="map-rings" />
            {LANDMARKS.filter((landmark) => landmark.kind === 'discover').map((landmark) => (
              <span
                key={landmark.id}
                className={`map-place ${snapshot.tasks[landmark.id as keyof Tasks] ? 'found' : ''}`}
                style={{ left: `${50 + (landmark.x / 180) * 50}%`, top: `${50 + (landmark.z / 180) * 50}%` }}
                title={landmark.name}
              >{landmark.id === 'lake' ? <Waves /> : landmark.id === 'tower' ? <TreePine /> : <Flower2 />}</span>
            ))}
            <span className="map-home" style={{ left: '50%', top: '50%' }}><HomeIcon /></span>
            <span className="map-player" style={{ left: `${50 + (snapshot.x / 180) * 50}%`, top: `${50 + (snapshot.z / 180) * 50}%`, transform: `translate(-50%,-50%) rotate(${180 - (snapshot.heading * 180) / Math.PI}deg)` }} />
          </aside>

          <section className="horse-status">
            <div className="status-title"><div><span>RÜZGÂR</span><small>{snapshot.mounted ? 'Eyerde' : 'Yanında'}</small></div><div className="bond"><Heart size={14} fill="currentColor" /> {completedBond}</div></div>
            <div className="meters-grid">
              <Meter icon={<Zap />} label="Enerji" value={snapshot.needs.energy} tone="energy" />
              <Meter icon={<Wheat />} label="Yem" value={snapshot.needs.hunger} tone="hunger" />
              <Meter icon={<Droplets />} label="Su" value={snapshot.needs.thirst} tone="water" />
              <Meter icon={<Sparkles />} label="Bakım" value={snapshot.needs.care} tone="care" />
            </div>
          </section>

          <div className="ride-status">
            <Gauge size={19} />
            <div><b>{snapshot.gait}</b><span>{Math.abs(Math.round(snapshot.speed * 3.6))} km/sa</span></div>
          </div>

          {snapshot.prompt && snapshot.phase === 'playing' && <div className="interaction-prompt">{snapshot.prompt}</div>}
          <div className="control-hint"><span><kbd>W/S</kbd> hız</span><span><kbd>A/D</kbd> yön</span><span><kbd>R</kbd> in/bin</span><span><kbd>H</kbd> çağır</span><span><kbd>Esc</kbd> duraklat</span></div>

          {snapshot.phase === 'playing' && (
            <div className="touch-controls">
              <div className="touch-directions">
                <TouchKey code="KeyW" label="İleri" engine={engine} />
                <TouchKey code="KeyA" label="Sol" engine={engine} />
                <TouchKey code="KeyS" label="Geri" engine={engine} />
                <TouchKey code="KeyD" label="Sağ" engine={engine} />
              </div>
              <div className="touch-actions">
                <HoldKey code="ShiftLeft" glyph="⇧" caption="Dörtnal" engine={engine} />
                <HoldKey code="Space" glyph="␣" caption="Zıpla" engine={engine} />
                <button onClick={() => engine?.interact()}>E<small>EtKileşim</small></button>
                <button onClick={() => engine?.toggleMount()}>R<small>İn / bin</small></button>
              </div>
            </div>
          )}
        </>
      )}

      {snapshot.toast && toastVisible && snapshot.phase === 'playing' && (
        <div key={snapshot.toastId} className="game-toast" role="status">{snapshot.toast}</div>
      )}

      {ready && snapshot.phase === 'paused' && (
        <section className="modal-backdrop">
          <div className="paper-panel pause-panel">
            <div className="modal-heading"><div><p className="eyebrow">GÜN {snapshot.day}</p><h2>Yolculuk duraklatıldı</h2></div><button className="icon-close" onClick={() => engine?.resume()} aria-label="Kapat"><X /></button></div>
            <button className="primary-button wide" onClick={() => engine?.resume()}><Play size={17} /> Devam et</button>
            <div className="settings-block">
              <label className="setting-row"><span><CloudRain size={17} /> Yağmur</span><input type="checkbox" checked={snapshot.raining} onChange={(event) => engine?.setRain(event.target.checked)} /></label>
              <label className="setting-row"><span><Gauge size={17} /> Otomatik gün döngüsü</span><input type="checkbox" checked={snapshot.autoCycle} onChange={(event) => engine?.setAutoCycle(event.target.checked)} /></label>
              <label className="time-setting"><span>Gün saati <b>{formatTime(snapshot.time)}</b></span><input type="range" min="0" max="23.9" step="0.1" value={snapshot.time} onChange={(event) => engine?.setTime(Number(event.target.value))} /></label>
              <div className="quality-setting"><span>Görüntü kalitesi</span><div><button className={snapshot.quality === 'low' ? 'selected' : ''} onClick={() => engine?.setQuality('low')}>Akıcı</button><button className={snapshot.quality === 'high' ? 'selected' : ''} onClick={() => engine?.setQuality('high')}>Ayrıntılı</button></div></div>
            </div>
            <div className="pause-links"><button onClick={() => setHelpOpen(true)}><BookOpen size={16} /> Kontroller</button><button onClick={() => engine?.restart()}><RotateCcw size={16} /> Yeni yolculuk</button></div>
            <p className="storage-note">Gün, bağlılık ve ayarlar yalnızca bu tarayıcıda saklanır. Tarayıcı verilerini silmek ilerlemeyi kaldırır.</p>
          </div>
        </section>
      )}

      {ready && snapshot.phase === 'summary' && (
        <section className="modal-backdrop summary-backdrop">
          <div className="paper-panel summary-panel">
            <p className="eyebrow">GÜN {snapshot.day} TAMAMLANDI</p>
            <h2>Ormanla biraz daha<br /><em>bütünleştin.</em></h2>
            <p>{snapshot.summaryReason}</p>
            <div className="summary-stats"><div><b>{snapshot.completed}/7</b><span>Rota tamamlandı</span></div><div><b>{completedBond}</b><span>Bağlılık</span></div><div><b>{Math.round(snapshot.needs.energy)}</b><span>Kalan enerji</span></div></div>
            <button className="primary-button wide" onClick={() => engine?.nextDay()}>Yeni güne uyan <ChevronRight size={18} /></button>
            <button className="text-button centered" onClick={() => engine?.restart()}><RotateCcw size={16} /> İlk günden başla</button>
          </div>
        </section>
      )}

      {helpOpen && (
        <section className="modal-backdrop help-backdrop" onClick={(event) => { if (event.target === event.currentTarget) setHelpOpen(false) }}>
          <div className="paper-panel help-panel" role="dialog" aria-modal="true" aria-labelledby="help-title">
            <div className="modal-heading"><div><p className="eyebrow">VADİ REHBERİ</p><h2 id="help-title">Kontroller ve yaşam</h2></div><button className="icon-close" onClick={() => setHelpOpen(false)} aria-label="Rehberi kapat"><X /></button></div>
            <div className="help-grid">
              <div><kbd>W / S</kbd><span>Hızlan, yavaşla veya geri git</span></div><div><kbd>A / D</kbd><span>Yönünü değiştir</span></div>
              <div><kbd>Shift</kbd><span>Dörtnala kalk / koş</span></div><div><kbd>Space</kbd><span>Sürüş sırasında küçük sıçrama</span></div>
              <div><kbd>R</kbd><span>Ata bin veya atından in</span></div><div><kbd>H</kbd><span>Uzaktayken atını çağır</span></div>
              <div><kbd>E</kbd><span>Bakım yap, keşfet, dinlen</span></div><div><kbd>Fare</kbd><span>Sürükleyerek bak, tekerlekle yakınlaş</span></div>
            </div>
            <p className="help-tip">Atının enerjisi, yemi, suyu ve bakımı gün boyunca azalır. Ahır çevresindeki yemlik, yalak ve bakım noktasına yaklaşıp E tuşuna bas. Yüksek bakım, bağlılığı artırır.</p>
            <details className="credits"><summary>Varlık kaynakları ve çalıştırma</summary><p>At modeli: <b>mirada / Roma</b>, Three.js örnekleri (MIT). Bölüm, arazi ve bitki yerleşimi: sağlanan Cabin in the Woods şablonundan uyarlandı. Binalar, binici, bitki geometrileri, arayüz ve sesler bu proje için kodla üretildi.</p><p>Yerel çalıştırma: <code>npm install</code>, ardından <code>npm run dev</code>. Üretim: <code>npm run build</code>; <code>dist</code> klasörünü statik olarak sun.</p></details>
            <button className="primary-button wide" onClick={() => setHelpOpen(false)}>Anladım</button>
          </div>
        </section>
      )}
    </main>
  )
}
