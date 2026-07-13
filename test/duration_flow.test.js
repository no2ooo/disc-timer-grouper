// test/duration_flow.test.js
// 集成测试:_promptAdjust 与 parseDuration 的衔接(分+秒时长功能)
// 用 mock 的 wx.showModal 模拟用户输入,加载 pages/index/index.js 的真实逻辑。
// 运行: node test/duration_flow.test.js

let pass = 0, fail = 0;
function check(name, cond, extra) {
  const ok = !!cond;
  console.log((ok ? '✓' : '✗') + ' ' + name + (ok ? '' : '  -> ' + (extra || '')));
  ok ? pass++ : fail++;
}

// ---------- 全局桩(must set before require index.js) ----------
global.getApp = () => ({
  globalData: { settings: { sound: true, vibrate: false, keepScreen: false } }
});

let modalSuccessCb = null;        // 捕获 wx.showModal 的 success 回调
let showActionSheetCalled = false;

const fakeAudio = {
  play() {}, stop() {}, seek() {}, destroy() {},
  onCanplay() {}, onError() {}, onEnded() {},
  set src(v) {}, get src() { return '/qidi.mp3'; },
};

global.wx = {
  getStorageSync: () => null,
  setStorageSync: () => {},
  showActionSheet: () => { showActionSheetCalled = true; },
  showModal: (opts) => { modalSuccessCb = opts && opts.success; },
  showToast: () => {},
  setKeepScreenOn: () => {},
  vibrateShort: () => {},
  createInnerAudioContext: () => fakeAudio,
};

let capturedPage = null;
global.Page = (o) => { capturedPage = o; };

// require 页面逻辑(会执行 const app=getApp(); 与 Page({...}))
require('../pages/index/index.js');

if (!capturedPage) {
  console.error('未能捕获 Page 对象,require 失败');
  process.exit(1);
}

// 构造一个实例:复制 methods + data,提供 setData
function makeInstance() {
  const inst = Object.assign({}, capturedPage);
  inst.data = JSON.parse(JSON.stringify(capturedPage.data || {}));
  inst.data.mode = 'hiit';
  inst.data.params = { prepare: 5, work: 30, rest: 5, cycles: 10, loopRest: 0 };
  inst._runner = null;
  inst._keepScreenOn = false;
  inst.setData = function (patch) { Object.assign(this.data, patch); };
  return inst;
}

// 模拟用户点击 ActionSheet -> _promptAdjust -> 在 showModal 里输入 content
function feed(inst, key, cur, label, content, confirm = true) {
  modalSuccessCb = null;
  inst._promptAdjust(key, cur, label);
  if (typeof modalSuccessCb !== 'function') {
    throw new Error('showModal 的 success 回调未被注册');
  }
  modalSuccessCb({ confirm, content });
}

// ===== 用例 1: 合法 '1:30' -> work 变为 90 =====
{
  const inst = makeInstance();
  feed(inst, 'work', 30, '锻炼 30s', '1:30');
  check("输入 '1:30' 后 params.work === 90", inst.data.params.work === 90,
    '实际=' + inst.data.params.work);
}

// ===== 用例 2: 合法 '2分30秒' -> work 变为 150 =====
{
  const inst = makeInstance();
  feed(inst, 'work', 30, '锻炼 30s', '2分30秒');
  check("输入 '2分30秒' 后 params.work === 150", inst.data.params.work === 150,
    '实际=' + inst.data.params.work);
}

// ===== 用例 3: 合法纯数字 '90' -> work 变为 90 =====
{
  const inst = makeInstance();
  feed(inst, 'work', 30, '锻炼 30s', '90');
  check("输入 '90' 后 params.work === 90", inst.data.params.work === 90,
    '实际=' + inst.data.params.work);
}

// ===== 用例 4: 非法 'abc' -> params 不变(函数直接 return) =====
{
  const inst = makeInstance();
  const before = JSON.stringify(inst.data.params);
  feed(inst, 'work', 30, '锻炼 30s', 'abc');
  const after = JSON.stringify(inst.data.params);
  check("输入 'abc' 后 params 不变", before === after, 'after=' + after);
}

// ===== 用例 5: 负数 '-5' -> params 不变 =====
{
  const inst = makeInstance();
  const before = JSON.stringify(inst.data.params);
  feed(inst, 'work', 30, '锻炼 30s', '-5');
  const after = JSON.stringify(inst.data.params);
  check("输入 '-5' 后 params 不变", before === after, 'after=' + after);
}

// ===== 用例 6: 空串 '' -> params 不变 =====
{
  const inst = makeInstance();
  const before = JSON.stringify(inst.data.params);
  feed(inst, 'work', 30, '锻炼 30s', '');
  const after = JSON.stringify(inst.data.params);
  check("输入 '' 后 params 不变", before === after, 'after=' + after);
}

// ===== 用例 7: 仅取消(confirm=false) -> params 不变 =====
{
  const inst = makeInstance();
  const before = JSON.stringify(inst.data.params);
  feed(inst, 'work', 30, '锻炼 30s', '1:30', false);
  const after = JSON.stringify(inst.data.params);
  check("取消弹窗后 params 不变", before === after, 'after=' + after);
}

// ===== 用例 8: cycles 走 parseInt 分支,输入 '12' -> cycles=12 =====
{
  const inst = makeInstance();
  feed(inst, 'cycles', 10, '周期 10', '12');
  check("cycles 输入 '12' 后 params.cycles === 12", inst.data.params.cycles === 12,
    '实际=' + inst.data.params.cycles);
}

// ===== 用例 9: cycles 非法 'abc' -> params.cycles 不变 =====
{
  const inst = makeInstance();
  const before = inst.data.params.cycles;
  feed(inst, 'cycles', 10, '周期 10', 'abc');
  check("cycles 输入 'abc' 后不变", inst.data.params.cycles === before,
    '实际=' + inst.data.params.cycles);
}

console.log(`\n集成测试通过 ${pass} / 失败 ${fail}`);
process.exit(fail ? 1 : 0);
