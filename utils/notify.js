// utils/notify.js
// 通知封装:振动 + qidi.mp3 本地音频(InnerAudioContext)
let audioCtx = null;
let audioReady = false;

function ensureAudio() {
  if (audioCtx) return audioCtx;
  try {
    audioCtx = wx.createInnerAudioContext({ useWebAudioImplement: false });
    audioCtx.src = '/qidi.mp3';
    audioCtx.volume = 0.7;
    audioCtx.onError((err) => { console.warn('[notify] audio error', err); audioReady = false; });
    // 重要:开发者工具上 onCanplay 经常不触发,先标 false,真机回调后再开
    audioCtx.onCanplay(() => { audioReady = true; });
  } catch (e) {
    audioReady = false;
  }
  return audioCtx;
}

function beep(opts = {}) {
  const { sound = true, vibrate = true, long = false } = opts;
  if (vibrate) {
    try { wx.vibrateShort({ type: 'medium' }); } catch (e) {}
  }
  // 无论 sound 与否都 ensureAudio:首次调用即建好 ctx,等 onCanplay 回调
  // 后,下一次真 beep 就能响 —— 避免"准备"阶段结束听不到第一声响
  const ctx = ensureAudio();
  if (sound) {
    if (ctx && audioReady) {
      try {
        // 停止当前 → seek 回开头 → 重新播放
        ctx.stop();
        ctx.seek(0);
        ctx.volume = long ? 0.9 : 0.7;
        ctx.play();
      } catch (e) {}
    }
  }
}

function phaseEnd(opts = {}) { beep(Object.assign({ long: true }, opts)); }
function countDown(opts = {}) { beep(Object.assign({ long: false }, opts)); }
function tap() { wx.vibrateShort({ type: 'light' }); }

// 页面 onUnload 时调用,主动释放音频实例(避免跨页面残留 & iOS 后台被系统回收)
function destroy() {
  if (audioCtx) {
    try { audioCtx.stop(); } catch (e) {}
    try { audioCtx.destroy(); } catch (e) {}
    audioCtx = null;
    audioReady = false;
  }
}

module.exports = { beep, phaseEnd, countDown, tap, destroy };
