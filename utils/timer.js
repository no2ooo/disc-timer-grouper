// utils/timer.js
// 高精度倒计时调度器:基于 Date.now() 计算,避免 setInterval 漂移
// 支持:start/pause/resume/reset/skip + onTick(remainingSec, phaseName) + onPhaseEnd(phaseName, nextPhase)

class PhaseRunner {
  constructor(phases) {
    // phases: [{ name, durationSec, color? }]
    this.phases = phases || [];
    this.reset();
  }

  reset() {
    this.idx = 0;
    this.phaseStartedAt = 0;
    this.pausedAt = 0;
    this.pausedTotal = 0;
    this.running = false;
    this._timer = null;
    this._cb = { tick: () => {}, phaseEnd: () => {}, complete: () => {} };
  }

  setPhases(phases) {
    this.phases = phases || [];
  }

  on(event, fn) {
    if (this._cb[event]) this._cb[event] = fn;
  }

  currentPhase() {
    return this.phases[this.idx] || null;
  }

  // 当前 phase 剩余时间(秒,带 0.1 精度)
  remaining() {
    if (!this.running) {
      if (!this.pausedAt) return (this.currentPhase() || { durationSec: 0 }).durationSec;
      const elapsed = (this.pausedAt - this.phaseStartedAt - this.pausedTotal) / 1000;
      return Math.max(0, (this.currentPhase() || { durationSec: 0 }).durationSec - elapsed);
    }
    const elapsed = (Date.now() - this.phaseStartedAt - this.pausedTotal) / 1000;
    return Math.max(0, (this.currentPhase() || { durationSec: 0 }).durationSec - elapsed);
  }

  // 总剩余(所有 phase 累计)
  totalRemaining() {
    let r = this.remaining();
    for (let i = this.idx + 1; i < this.phases.length; i++) {
      r += (this.phases[i] && this.phases[i].durationSec) || 0;
    }
    return r;
  }

  start() {
    if (this.running) return;
    if (!this.phases.length) return;
    this.running = true;
    this.phaseStartedAt = Date.now();
    this.pausedTotal = 0;
    this.pausedAt = 0;
    this._loop();
  }

  pause() {
    if (!this.running) return;
    this.running = false;
    this.pausedAt = Date.now();
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }

  resume() {
    if (this.running || !this.phases.length) return;
    if (!this.pausedAt) return;
    this.pausedTotal += Date.now() - this.pausedAt;
    this.pausedAt = 0;
    this.running = true;
    this._loop();
  }

  // 跳到下一 phase
  skip() {
    if (this._timer) clearTimeout(this._timer);
    const endedName = this.currentPhase() && this.currentPhase().name;
    this.idx++;
    this.phaseStartedAt = Date.now();
    this.pausedTotal = 0;
    this.pausedAt = 0;
    if (this.idx >= this.phases.length) {
      this.running = false;
      // 与 _loop 自然结束路径保持一致:先 phaseEnd 再 complete
      this._cb.phaseEnd && this._cb.phaseEnd(endedName, null);
      this._cb.complete && this._cb.complete();
      return;
    }
    this._cb.phaseEnd && this._cb.phaseEnd(endedName, this.currentPhase());
    if (this.running) this._loop();
  }

  stop() {
    this.running = false;
    if (this._timer) clearTimeout(this._timer);
    this._timer = null;
  }

  _loop() {
    if (!this.running) return;
    const remain = this.remaining();
    this._cb.tick && this._cb.tick(remain, this.currentPhase() && this.currentPhase().name, this.totalRemaining());

    if (remain <= 0) {
      // 结束当前 phase
      const endedName = this.currentPhase() && this.currentPhase().name;
      this.idx++;
      this.phaseStartedAt = Date.now();
      this.pausedTotal = 0;
      this.pausedAt = 0;
      if (this.idx >= this.phases.length) {
        this.running = false;
        this._cb.phaseEnd && this._cb.phaseEnd(endedName, null);
        this._cb.complete && this._cb.complete();
        return;
      }
      this._cb.phaseEnd && this._cb.phaseEnd(endedName, this.currentPhase());
      this._loop();
    } else {
      // 100ms 调度一次,保证 0.1s 精度
      this._timer = setTimeout(() => this._loop(), 100);
    }
  }
}

module.exports = PhaseRunner;
