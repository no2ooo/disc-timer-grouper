// test/notify.test.js
// 声音提醒可用性测试:mock wx.createInnerAudioContext,验证 beep/phaseEnd/countDown/tap
// 触发 play() 的时机,以及 IDE 上 onCanplay 不触发 -> audioReady=false -> 哑火。
// 运行: node test/notify.test.js

let pass = 0, fail = 0;
function check(name, cond, extra) {
  const ok = !!cond;
  console.log((ok ? '✓' : '✗') + ' ' + name + (ok ? '' : '  -> ' + (extra || '')));
  ok ? pass++ : fail++;
}

// 构造一个假 InnerAudioContext,记录 play/stop/seek/destroy 次数,并可手动触发 onCanplay
function makeAudio() {
  const calls = { play: 0, stop: 0, seek: 0, destroy: 0 };
  const ctx = {
    _src: '',
    _onCanplay: null,
    _onError: null,
    _onEnded: null,
    volume: 0,
    autoplay: false,
    play() { calls.play++; },
    stop() { calls.stop++; },
    seek() { calls.seek++; },
    destroy() { calls.destroy++; },
    set src(v) { this._src = v; },
    get src() { return this._src; },
    onCanplay(cb) { this._onCanplay = cb; },
    onError(cb) { this._onError = cb; },
    onEnded(cb) { this._onEnded = cb; },
    // 手动触发模拟"真机 ready"
    fireCanplay() { if (this._onCanplay) this._onCanplay(); },
  };
  return { ctx, calls };
}

// 每次用全新 notify 模块(清缓存),并注入当前 global.wx
function loadNotify(audioCtx) {
  global.wx = {
    vibrateShort: () => {},
    createInnerAudioContext: () => audioCtx.ctx,
  };
  delete require.cache[require.resolve('../utils/notify.js')];
  return require('../utils/notify.js');
}

// ============ 场景 A: 真机(onCanplay 触发,audioReady=true) ============
console.log('--- 场景A: 真机(音频就绪) ---');
{
  const audio = makeAudio();
  const notify = loadNotify(audio);

  // 预热(对应 index.onLoad 里的 beep({sound:false,vibrate:false}))
  notify.beep({ sound: false, vibrate: false });
  check('预热时 play 未被调用', audio.calls.play === 0, 'play=' + audio.calls.play);

  // 真机:onCanplay 回调触发 -> audioReady=true
  audio.ctx.fireCanplay();

  notify.beep({ sound: true });
  check('beep({sound:true}) 触发 play', audio.calls.play === 1, 'play=' + audio.calls.play);

  const beforePhase = audio.calls.play;
  notify.phaseEnd({ sound: true });
  check('phaseEnd({sound:true}) 触发 play', audio.calls.play === beforePhase + 1,
    'play=' + audio.calls.play);

  const beforeCount = audio.calls.play;
  notify.countDown({ sound: true });
  check('countDown({sound:true}) 触发 play', audio.calls.play === beforeCount + 1,
    'play=' + audio.calls.play);

  // tap 只振动,不应触发 play
  const beforeTap = audio.calls.play;
  notify.tap();
  check('tap() 不触发 play(仅振动)', audio.calls.play === beforeTap,
    'play=' + audio.calls.play);
}

// ============ 场景 B: IDE(onCanplay 永不触发,audioReady=false) ============
console.log('--- 场景B: 开发者工具(音频始终未就绪) ---');
{
  const audio = makeAudio();
  const notify = loadNotify(audio);

  // 模拟 IDE:onLoad 预热 + 之后所有响铃,但 onCanplay 永远不触发
  notify.beep({ sound: false, vibrate: false });
  notify.beep({ sound: true });
  notify.phaseEnd({ sound: true });
  notify.countDown({ sound: true });
  check('IDE 下 beep/phaseEnd/countDown 均未触发 play(哑火)', audio.calls.play === 0,
    'play=' + audio.calls.play);
}

// ============ 场景 C: 显式验证 audioReady 标志的隔离性 ============
console.log('--- 场景C: 模块状态隔离(每次 fresh require) ---');
{
  // B 场景里 audioReady 是 false;重新加载一个全新模块,不触发 onCanplay,
  // 确认新实例初始就是 false(B 的 false 不会污染新实例)。
  const audio = makeAudio();
  const notify = loadNotify(audio);
  notify.beep({ sound: true });
  check('新模块默认 audioReady=false(play 未调用)', audio.calls.play === 0,
    'play=' + audio.calls.play);

  audio.ctx.fireCanplay();
  notify.beep({ sound: true });
  check('触发 onCanplay 后该实例可响', audio.calls.play === 1,
    'play=' + audio.calls.play);
}

console.log(`\n声音提醒测试通过 ${pass} / 失败 ${fail}`);
process.exit(fail ? 1 : 0);
