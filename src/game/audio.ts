import { mulberry32 } from './world'

export class GameAudio {
  private context?: AudioContext
  private master?: GainNode
  private rain?: GainNode
  private nextHoof = 0
  private muted = false

  async init() {
    if (!this.context) {
      this.context = new AudioContext()
      this.master = this.context.createGain()
      this.master.gain.value = this.muted ? 0 : 0.55
      this.master.connect(this.context.destination)
      this.createNoiseLayer(380, 0.035)
      this.rain = this.createNoiseLayer(1700, 0)
    }
    if (this.context.state === 'suspended') await this.context.resume()
  }

  private createNoiseLayer(frequency: number, volume: number) {
    const context = this.context!
    const length = context.sampleRate * 3
    const buffer = context.createBuffer(1, length, context.sampleRate)
    const data = buffer.getChannelData(0)
    let last = 0
    const random = mulberry32(8128 + frequency)
    for (let i = 0; i < length; i++) {
      const white = random() * 2 - 1
      last = last * 0.96 + white * 0.04
      data[i] = last * 3
    }
    const source = context.createBufferSource()
    source.buffer = buffer
    source.loop = true
    const filter = context.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = frequency
    const gain = context.createGain()
    gain.gain.value = volume
    source.connect(filter).connect(gain).connect(this.master!)
    source.start()
    return gain
  }

  update(speed: number, mounted: boolean, playing: boolean) {
    if (!this.context || !this.master) return
    const now = this.context.currentTime
    if (!playing || !mounted || Math.abs(speed) < 0.7 || now < this.nextHoof) return
    const pace = Math.max(0.13, 0.56 - Math.abs(speed) * 0.032)
    this.nextHoof = now + pace
    this.hoof(now, 0)
    this.hoof(now + pace * 0.45, 0.7)
  }

  private hoof(time: number, level: number) {
    const context = this.context!
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = 'triangle'
    oscillator.frequency.setValueAtTime(115, time)
    oscillator.frequency.exponentialRampToValueAtTime(48, time + 0.075)
    gain.gain.setValueAtTime(0.11 * level, time)
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.09)
    oscillator.connect(gain).connect(this.master!)
    oscillator.start(time)
    oscillator.stop(time + 0.1)
  }

  chime(kind: 'care' | 'discover' | 'ui' = 'ui') {
    if (!this.context || !this.master) return
    const now = this.context.currentTime
    const notes = kind === 'discover' ? [392, 523, 659] : kind === 'care' ? [330, 440] : [440]
    notes.forEach((frequency, index) => {
      const oscillator = this.context!.createOscillator()
      const gain = this.context!.createGain()
      const start = now + index * 0.09
      oscillator.type = 'sine'
      oscillator.frequency.value = frequency
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(0.09, start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35)
      oscillator.connect(gain).connect(this.master!)
      oscillator.start(start)
      oscillator.stop(start + 0.4)
    })
  }

  setRaining(raining: boolean) {
    if (this.rain && this.context) this.rain.gain.setTargetAtTime(raining ? 0.12 : 0, this.context.currentTime, 0.4)
  }

  setMuted(muted: boolean) {
    this.muted = muted
    if (this.master && this.context) this.master.gain.setTargetAtTime(muted ? 0 : 0.55, this.context.currentTime, 0.05)
  }

  dispose() {
    void this.context?.close()
    this.context = undefined
  }
}
