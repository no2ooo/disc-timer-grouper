// test/setting_accept.test.js
// 独立端到端验收:mock wx / getApp / Page + spy storage.addPreset,
// 加载 pages/index/index.js,真实模拟用户"设置 UI 改造"全流程。
// 覆盖团队主理人给定的 7 个验收场景。运行:node test/setting_accept.test.js

'use strict';

// ---------- 简易断言框架(无第三方依赖) ----------
let failures = 0;
function assert(cond, msg) {
  if (cond) {
    console.log('  PASS: ' + msg);
  } else {
    console.error('  FAIL: ' + msg);
    failures += 1;
  }
}

// ---------- 深度 setData 路径支持(模拟小程序 setData) ----------
function setPath(obj, path, value) {
  const re = /([^.\[\]]+)|\[(\d+)\]/g;
  const tokens = [];
  let m;
  while ((m = re.exec(path)) !== null) {
    tokens.push(m[1] !== undefined ? m[1] : m[2]);
  }
  let cur = obj;
  for (let i = 0; i < tokens.length - 1; i++) {
    const t = tokens[i];
    if (cur[t] == null) {
      cur[t] = /^\d+$/.test(tokens[i + 1]) ? [] : {};
    }
    cur = cur[t];
  }
  cur[tokens[tokens.length - 1]] = value;
}

// ---------- mock storage.addPreset(spy,验证是否被调用) ----------
const storage = require('../utils/storage.js');
let addPresetCalls = 0;
let lastPreset = null;
const origAddPreset = storage.addPreset;
storage.addPreset = function (preset) {
  addPresetCalls += 1;
  lastPreset = preset;
  return origAddPreset(preset);
};

// ---------- mock 全局环境 ----------
global.getApp = function () {
  return { globalData: { settings: { sound: false, vibrate: false, keepScreen: false } } };
};

let captured = null;
global.Page = function (cfg) { captured = cfg; };

global.wx = {
  createInnerAudioContext: function () {
    return { src: '', volume: 1, onError() {}, onCanplay() {}, stop() {}, seek() {}, play() {}, destroy() {} };
  },
  vibrateShort: function () {},
  setStorageSync: function () {},
  getStorageSync: function () { return null; },
  setKeepScreenOn: function () {},
  showToast: function () {}
};

// ---------- 加载页面 ----------
require('../pages/index/index.js');
if (!captured) {
  console.error('页面配置未通过 Page() 捕获,测试中止');
  process.exit(1);
}

// 构造页面实例
const page = Object.assign({}, captured);
page.data = JSON.parse(JSON.stringify(captured.data));
page.setData = function (patch) {
  const self = this;
  Object.keys(patch).forEach(function (k) { setPath(self.data, k, patch[k]); });
};

// 模拟 onLoad 初始化 hiit 模式(默认参数)
page.onLoad();

const findIdx = function (key) {
  return page.data.settingFields.findIndex(function (f) { return f.key === key; });
};
const input = function (key, field, value) {
  const idx = findIdx(key);
  page.onSettingInput({ currentTarget: { dataset: { key: key, field: field, index: idx } }, detail: { value: value } });
};

// ----- 场景 1: 打开设置面板,含 work 的 min/sec -----
console.log('\n[AC1] 打开设置面板 + work 字段含 min/sec');
page.onOpenSetting();
assert(page.data.showSetting === true, 'onOpenSetting -> showSetting=true');
const wIdx = findIdx('work');
assert(wIdx >= 0 && page.data.settingFields[wIdx].type === 'duration', 'settingFields 含 work(duration 型)');
assert(page.data.settingFields[wIdx].min !== undefined && page.data.settingFields[wIdx].sec !== undefined,
  'work 字段含 min / sec 两个数字框');

// ----- 场景 2: 输入 6 分 30 秒 -> 确认 -> params.work === 390 -----
console.log('\n[AC2] 输入 6分30秒 并确认写回');
input('work', 'min', '6');
input('work', 'sec', '30');
page.onConfirmSetting();
assert(page.data.params.work === 390, 'params.work === 6*60+30 = 390 (实际 ' + page.data.params.work + ')');
assert(page.data.showSetting === false, 'onConfirmSetting 后面板关闭');

// ----- 场景 3: 秒输入 90 -> 截断 59(输入处理层) -----
console.log('\n[AC3] 秒数截断 0-59');
page.onOpenSetting();
input('work', 'sec', '90');
assert(page.data.settingFields[findIdx('work')].sec === '59', '秒 90 -> 截断为 59 (实际 ' + page.data.settingFields[findIdx('work')].sec + ')');

// ----- 场景 4: 周期 0 或 "" -> 兜底 1 -----
console.log('\n[AC4] 周期兜底 >=1 (输入 0 与 空串)');
input('cycles', 'val', '0');
assert(page.data.settingFields[findIdx('cycles')].val === '1', '周期 0 -> 输入层截断为 1');
input('cycles', 'val', '');
page.onConfirmSetting();
assert(page.data.params.cycles === 1, '空串经确认后 parseInt(NaN) -> cycles 兜底为 1 (实际 ' + page.data.params.cycles + ')');

// ----- 场景 5: 字母过滤 1a2 -> 12 -----
console.log('\n[AC5] 非数字字符过滤');
page.onOpenSetting();
input('work', 'min', '1a2');
assert(page.data.settingFields[findIdx('work')].min === '12', '输入 1a2 -> 正则滤成 12');

// ----- 场景 6: 关闭面板不写回 params -----
console.log('\n[AC6] 关闭面板不写回 params');
page.onOpenSetting();
const workBefore = page.data.params.work;
input('work', 'min', '99');
page.onCloseSetting();
assert(page.data.showSetting === false, 'onCloseSetting 隐藏面板');
assert(page.data.params.work === workBefore, '关闭不写回 params (仍为 ' + workBefore + ')');

// ----- 场景 7: 保存为预设 -> storage.addPreset 被调用 + 面板关闭 -----
console.log('\n[AC7] 保存为预设调用 storage.addPreset');
page.onOpenSetting();
input('cycles', 'val', '15');
const before = addPresetCalls;
page.onSavePreset();
assert(addPresetCalls === before + 1, 'storage.addPreset 被调用一次');
assert(page.data.showSetting === false, 'onSavePreset 后面板关闭');
assert(lastPreset && lastPreset.params && lastPreset.params.cycles === 15, '预设对象含已应用的 cycles=15');

// ----- 附加: 秒表模式"时间回圈"为 duration(min/sec) -----
console.log('\n[AC8] 秒表模式:时间回圈渲染为 分钟/秒');
page._initMode('stopwatch');
page.onOpenSetting();
const lapIdx = findIdx('lap');
assert(lapIdx >= 0 && page.data.settingFields[lapIdx].type === 'duration', 'lap(时间回圈) 为 duration 型');
assert(page.data.settingFields[lapIdx].min !== undefined && page.data.settingFields[lapIdx].sec !== undefined,
  'lap 含 min / sec 两个数字框');

console.log('\n========================================');
if (failures === 0) {
  console.log('独立端到端验收全部通过 ✅  (IS_PASS: YES)');
  process.exit(0);
} else {
  console.error('存在 ' + failures + ' 个失败用例 ❌');
  process.exit(1);
}
