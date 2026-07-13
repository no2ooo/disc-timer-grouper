// test/setting_ui.test.js
// 集成测试:mock wx / getApp / Page,加载 pages/index/index.js,
// 模拟打开自定义设置面板、输入分钟/秒,断言 params 正确更新。
// 运行:node test/setting_ui.test.js

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

// ---------- mock 全局环境 ----------
const toastCalls = [];

global.getApp = function () {
  return {
    globalData: {
      settings: { sound: false, vibrate: false, keepScreen: false }
    }
  };
};

let captured = null;
global.Page = function (cfg) {
  captured = cfg;
};

global.wx = {
  createInnerAudioContext: function () {
    return {
      src: '',
      volume: 1,
      onError: function () {},
      onCanplay: function () {},
      stop: function () {},
      seek: function () {},
      play: function () {},
      destroy: function () {}
    };
  },
  vibrateShort: function () {},
  setStorageSync: function () {},
  getStorageSync: function () { return null; },
  setKeepScreenOn: function () {},
  showToast: function (o) { toastCalls.push(o); }
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
  Object.keys(patch).forEach(function (k) {
    setPath(self.data, k, patch[k]);
  });
};

// 模拟 onLoad 初始化 hiit 模式(使用默认参数)
page.onLoad();

console.log('\n[1] 打开面板 + 字段构建');
page.onOpenSetting();
assert(page.data.showSetting === true, 'onOpenSetting 打开面板 (showSetting=true)');
const fields = page.data.settingFields;
assert(Array.isArray(fields) && fields.length === 4, 'hiit 模式构建 4 个字段 (prepare/work/rest/cycles)');
assert(fields[0].key === 'prepare' && fields[0].type === 'duration', '首个字段为 prepare(时长型)');
assert(fields[3].key === 'cycles' && fields[3].type === 'count', '末个字段为 cycles(计数型)');
assert(fields[0].min === '0' && fields[0].sec === '5', 'prepare 默认 5s -> 0分5秒');

console.log('\n[2] 时长输入框:分钟/秒');
const workIdx = page.data.settingFields.findIndex(function (f) { return f.key === 'work'; });
page.onSettingInput({ currentTarget: { dataset: { key: 'work', field: 'min', index: workIdx } }, detail: { value: '2' } });
page.onSettingInput({ currentTarget: { dataset: { key: 'work', field: 'sec', index: workIdx } }, detail: { value: '5' } });
assert(page.data.settingFields[workIdx].min === '2' && page.data.settingFields[workIdx].sec === '5', 'work 输入为 2分5秒');

console.log('\n[3] 秒数截断 (0-59)');
page.onSettingInput({ currentTarget: { dataset: { key: 'work', field: 'sec', index: workIdx } }, detail: { value: '75' } });
assert(page.data.settingFields[workIdx].sec === '59', '秒 75 -> 截断为 59');

console.log('\n[4] 分钟截断 (0-999)');
page.onSettingInput({ currentTarget: { dataset: { key: 'work', field: 'min', index: workIdx } }, detail: { value: '1500' } });
assert(page.data.settingFields[workIdx].min === '999', '分钟 1500 -> 截断为 999');

console.log('\n[5] 非数字字符过滤');
page.onSettingInput({ currentTarget: { dataset: { key: 'work', field: 'min', index: workIdx } }, detail: { value: '1a2' } });
assert(page.data.settingFields[workIdx].min === '12', '输入 1a2 -> 仅保留数字 12');

console.log('\n[6] 确认修改写回 params');
page.onSettingInput({ currentTarget: { dataset: { key: 'work', field: 'min', index: workIdx } }, detail: { value: '2' } });
page.onSettingInput({ currentTarget: { dataset: { key: 'work', field: 'sec', index: workIdx } }, detail: { value: '5' } });
page.onConfirmSetting();
assert(page.data.params.work === 125, 'work params = 2*60+5 = 125');
assert(page.data.showSetting === false, 'onConfirmSetting 关闭面板');

console.log('\n[7] 保存为预设:应用 + 调用 _saveAsPreset');
const cycIdx = page.data.settingFields.findIndex(function (f) { return f.key === 'cycles'; });
page.onSettingInput({ currentTarget: { dataset: { key: 'cycles', field: 'val', index: cycIdx } }, detail: { value: '8' } });
const toastBefore = toastCalls.length;
page.onSavePreset();
assert(page.data.params.cycles === 8, 'cycles params = 8 (保存前已应用面板修改)');
assert(toastCalls.length === toastBefore + 1, 'showToast 被调用 (已保存提示)');
assert(page.data.showSetting === false, 'onSavePreset 关闭面板');

console.log('\n[8] 周期最小值截断 (>=1)');
page.onOpenSetting();
const cycIdx2 = page.data.settingFields.findIndex(function (f) { return f.key === 'cycles'; });
page.onSettingInput({ currentTarget: { dataset: { key: 'cycles', field: 'val', index: cycIdx2 } }, detail: { value: '0' } });
assert(page.data.settingFields[cycIdx2].val === '1', 'cycles 0 -> 截断为最小值 1');

console.log('\n[9] 关闭面板不写入 params');
page.onOpenSetting();
const workIdx3 = page.data.settingFields.findIndex(function (f) { return f.key === 'work'; });
page.onSettingInput({ currentTarget: { dataset: { key: 'work', field: 'min', index: workIdx3 } }, detail: { value: '9' } });
const workBeforeClose = page.data.params.work;
page.onCloseSetting();
assert(page.data.showSetting === false, 'onCloseSetting 隐藏面板');
assert(page.data.params.work === workBeforeClose, '关闭面板不写回 params (仍为 ' + workBeforeClose + ')');

console.log('\n========================================');
if (failures === 0) {
  console.log('全部测试通过 ✅  (IS_PASS: YES)');
  process.exit(0);
} else {
  console.error('存在 ' + failures + ' 个失败用例 ❌');
  process.exit(1);
}
