// pages/index/index.js
const app = getApp();
const PhaseRunner = require('../../utils/timer.js');
const { formatTime } = require('../../utils/format.js');
const storage = require('../../utils/storage.js');
const notify = require('../../utils/notify.js');

// 模式元数据
const MODES = {
  hiit: {
    name: '高强度间歇训练',
    defaults: { prepare: 5, work: 30, rest: 5, cycles: 10, loopRest: 0 },
    buildPhases(p) {
      const arr = [];
      if (p.prepare > 0) arr.push({ name: '准备', dur: p.prepare, kind: 'prepare' });
      for (let i = 0; i < p.cycles; i++) {
        arr.push({ name: '锻炼', dur: p.work, kind: 'work' });
        if (i < p.cycles - 1 && p.rest > 0) {
          arr.push({ name: '休息', dur: p.rest, kind: 'rest' });
        }
      }
      return arr;
    }
  },
  cycle: {
    name: '周期',
    defaults: { prepare: 5, work: 6, rest: 0, cycles: 20, loopRest: 0 },
    buildPhases(p) {
      const arr = [];
      if (p.prepare > 0) arr.push({ name: '准备', dur: p.prepare, kind: 'prepare' });
      for (let i = 0; i < p.cycles; i++) {
        arr.push({ name: '锻炼', dur: p.work, kind: 'work' });
      }
      return arr;
    }
  },
  stopwatch: {
    name: '秒表',
    defaults: { prepare: 3, lap: 5 },
    buildPhases(p) {
      const arr = [];
      if (p.prepare > 0) arr.push({ name: '准备', dur: p.prepare, kind: 'prepare' });
      arr.push({ name: '时间回圈', dur: 3600 * 4, kind: 'lap' });
      return arr;
    }
  }
};

Page({
  data: {
    mode: 'hiit',
    modeMeta: { name: '高强度间歇训练', totalLabel: '00:00.0' },
    params: {},
    bgClass: '',                      // 顶级背景 class
    bigBlockClass: 'bb-yellow',        // 主色块 class
    subBlockClass: 'sb-green',         // 次色块 class
    phaseName: '准备',
    bigNum: '00:05.0',
    subName: '锻炼:',
    subNum: '06:30',
    leftStatVal: '60',
    leftStatColorClass: 'slc-blue',
    leftStatLabel: '剩余周期',
    rightStatVal: '10',
    rightStatColorClass: 'slc-yellow',
    rightStatLabel: '剩余循环',
    showRightStat: true,           // hiit/cycle 显示右侧统计,秒表隐藏
    running: false,
    hint: '点击中央播放键开始',
    showSetting: false,            // 自定义设置面板显隐
    settingFields: []              // 面板内字段配置(分钟/秒/周期)
  },

  _runner: null,
  _lapInterval: null,
  _lastLapSecond: 0,

  onLoad() {
    // 预热音频:首次 beep 时 ctx 已就绪,避免"准备"阶段结束听不到第一声响
    notify.beep({ sound: false, vibrate: false });
    this._initMode('hiit');
  },

  onUnload() {
    this._stopRunner();
    notify.destroy();
  },

  // 切到其他 tab 再回来时,runner 仍在跑(setTimeout 不依赖 Page),
  // 但 setData 在后台时可能被丢弃;此处强制刷一帧,避免 UI 与内部状态脱节
  onShow() {
    if (this._runner && this.data.running) {
      const remain = this._runner.remaining();
      const cur = this._runner.currentPhase();
      this.setData({
        phaseName: cur ? cur.name : '',
        bigNum: formatTime(remain, true)
      });
    }
  },

  // ---------- 模式初始化 ----------
  _initMode(mode) {
    const meta = MODES[mode];
    const saved = wx.getStorageSync('lastParams_' + mode);
    const params = saved && typeof saved === 'object' ? saved : Object.assign({}, meta.defaults);
    this._setMode(mode, params);
    this._resetRunner();
  },

  _setMode(mode, params) {
    this.data.mode = mode;
    this.data.params = params;
    wx.setStorageSync('lastParams_' + mode, params);
    this._refreshStaticMeta();
  },

  _refreshStaticMeta() {
    const meta = MODES[this.data.mode];
    const phases = meta.buildPhases(this.data.params);
    const total = phases.reduce((s, p) => s + p.dur, 0);
    const modeMeta = {
      name: meta.name,
      totalLabel: this.data.mode === 'stopwatch'
        ? formatTime(paramsTotalForStopwatch(this.data.params), true)
        : formatTime(total, true)
    };
    this.setData({ modeMeta });
  },

  _resetRunner() {
    if (this._runner) { this._runner.stop(); this._runner = null; }
    this._renderIdle();
  },

  _renderIdle() {
    const mode = this.data.mode;
    const p = this.data.params;
    const meta = MODES[mode];
    const phases = meta.buildPhases(p);
    const first = phases[0] || { name: '准备', dur: 5 };

    if (mode === 'hiit') {
      this.setData({
        phaseName: first.name,
        bigNum: formatTime(first.dur, true),
        subName: '锻炼:',
        subNum: formatTime(p.work, false),
        leftStatVal: String(p.cycles),
        leftStatColorClass: 'slc-blue', leftStatLabel: '剩余周期',
        rightStatVal: '1',
        rightStatColorClass: 'slc-yellow', rightStatLabel: '剩余循环',
        showRightStat: true,
        bigBlockClass: 'bb-yellow',
        subBlockClass: 'sb-green',
        running: false
      });
    } else if (mode === 'cycle') {
      this.setData({
        phaseName: first.name,
        bigNum: formatTime(first.dur, true),
        subName: '锻炼:',
        subNum: formatTime(p.work, false),
        leftStatVal: String(p.cycles),
        leftStatColorClass: 'slc-blue', leftStatLabel: '剩余周期',
        rightStatVal: '',
        rightStatColorClass: 'slc-yellow', rightStatLabel: '',
        showRightStat: true,
        bigBlockClass: 'bb-yellow',
        subBlockClass: 'sb-green',
        running: false
      });
    } else {
      this.setData({
        phaseName: first.name,
        bigNum: formatTime(first.dur, true),
        subName: '时间回圈:',
        subNum: formatTime(p.lap, false),
        leftStatVal: '',
        leftStatColorClass: 'slc-blue', leftStatLabel: '',
        rightStatVal: '',
        rightStatColorClass: 'slc-yellow', rightStatLabel: '',
        showRightStat: false,
        bigBlockClass: 'bb-yellow',
        subBlockClass: 'sb-green',
        running: false
      });
    }
  },

  onTogglePlay() {
    notify.tap();
    if (this.data.running) this._pause();
    else this._start();
  },

  _start() {
    const meta = MODES[this.data.mode];
    const phases = meta.buildPhases(this.data.params);
    if (!phases.length) return;
    if (this._runner) this._runner.stop();

    this._runner = new PhaseRunner(phases.map(p => ({ name: p.name, durationSec: p.dur })));
    const settings = app.globalData.settings;

    this._runner.on('tick', (remain, name, totalRemain) => {
      const isHiit = this.data.mode === 'hiit';
      const isCycle = this.data.mode === 'cycle';
      const isSw = this.data.mode === 'stopwatch';
      const cur = this._runner.currentPhase();
      const idx = this._runner.idx;
      const phases = this._runner.phases;

      let leftVal = '', leftLabel = '剩余周期', leftCls = 'slc-blue';
      let rightVal = '', rightLabel = '剩余循环', rightCls = 'slc-yellow';
      let bigCls = 'bb-yellow';
      let subCls = 'sb-green';

      if (isHiit) {
        const remainingWorkCount = phases.slice(idx).filter(p => p.name === '锻炼').length;
        leftVal = String(Math.max(0, remainingWorkCount));
        leftLabel = '剩余周期';
        rightVal = '1';
        rightLabel = '剩余循环';
      } else if (isCycle) {
        const remainingWorkCount = phases.slice(idx).filter(p => p.name === '锻炼').length;
        leftVal = String(Math.max(0, remainingWorkCount));
        leftLabel = '剩余周期';
        rightVal = ''; rightLabel = '';
      } else {
        const totalDur = phases.reduce((s, p) => s + p.durationSec, 0);
        const elapsed = totalDur - totalRemain;
        leftVal = formatTime(elapsed, false);
        leftLabel = '已计时';
        rightVal = ''; rightLabel = '';
      }

      if (cur && cur.name === '休息') {
        bigCls = 'bb-red';
        subCls = 'sb-red';
      } else if (cur && cur.name === '准备') {
        bigCls = 'bb-yellow';
        subCls = 'sb-green';
      } else if (cur && cur.name === '时间回圈') {
        bigCls = 'bb-yellow';
        subCls = 'sb-green';
      } else if (cur && cur.name === '锻炼') {
        bigCls = 'bb-yellow';
        subCls = 'sb-green';
      }

      let subName = '锻炼:';
      let subNum = formatTime(this.data.params.work, false);
      if (isSw) {
        subName = '时间回圈:';
        subNum = formatTime(this.data.params.lap, false);
      }

      this.setData({
        phaseName: cur ? cur.name : '',
        bigNum: formatTime(remain, true),
        subName, subNum,
        leftStatVal: leftVal, leftStatLabel: leftLabel, leftStatColorClass: leftCls,
        rightStatVal: rightVal, rightStatLabel: rightLabel, rightStatColorClass: rightCls,
        bigBlockClass: bigCls, subBlockClass: subCls,
        running: true
      });
    });

    this._runner.on('phaseEnd', () => {
      if (settings.sound || settings.vibrate) {
        notify.phaseEnd({ sound: settings.sound, vibrate: settings.vibrate });
      }
      if (settings.keepScreen && !this._keepScreenOn) {
        wx.setKeepScreenOn({ keepScreenOn: true });
        this._keepScreenOn = true;
      }
    });

    this._runner.on('complete', () => {
      this.setData({ running: false, phaseName: '完成', bigNum: '00:00.0' });
      this._cleanupKeepScreen();
      notify.beep({ sound: settings.sound, vibrate: settings.vibrate, long: true });
      wx.showToast({ title: '训练完成', icon: 'success' });
    });

    this._runner.start();
    if (settings.keepScreen) {
      wx.setKeepScreenOn({ keepScreenOn: true });
      this._keepScreenOn = true;
    }
    if (this.data.mode === 'stopwatch') {
      this._lastLapSecond = 0;
      if (this._lapInterval) clearInterval(this._lapInterval);
      this._lapInterval = setInterval(() => {
        this._lastLapSecond += 1;
        if (this._lastLapSecond > 0 && this._lastLapSecond % this.data.params.lap === 0) {
          notify.countDown({ sound: settings.sound, vibrate: settings.vibrate });
        }
      }, 1000);
    }
  },

  _pause() {
    if (this._runner) this._runner.pause();
    if (this._lapInterval) { clearInterval(this._lapInterval); this._lapInterval = null; }
    this.setData({ running: false });
  },

  _stopRunner() {
    if (this._runner) { this._runner.stop(); this._runner = null; }
    if (this._lapInterval) { clearInterval(this._lapInterval); this._lapInterval = null; }
    this._cleanupKeepScreen();
  },

  _cleanupKeepScreen() {
    if (this._keepScreenOn) {
      wx.setKeepScreenOn({ keepScreenOn: false });
      this._keepScreenOn = false;
    }
  },

  onSwitchMode() {
    const order = ['hiit', 'cycle', 'stopwatch'];
    const i = order.indexOf(this.data.mode);
    const next = order[(i + 1) % order.length];
    notify.tap();
    this._stopRunner();
    this._initMode(next);
  },

  // ---------- 自定义设置面板 ----------
  onOpenSetting() {
    notify.tap();
    this._buildSettingFields();
    this.setData({ showSetting: true });
  },

  // 根据当前模式与 params 构建面板字段(分钟/秒/周期)
  _buildSettingFields() {
    const mode = this.data.mode;
    const p = this.data.params;
    const defs = [];

    const addDuration = (key, label) => {
      const total = p[key] || 0;
      const m = Math.floor(total / 60);
      const s = total % 60;
      defs.push({
        key,
        label,
        type: 'duration',
        min: String(m),
        sec: String(s),
        minPh: String(m),
        secPh: String(s)
      });
    };
    const addCount = (key, label) => {
      const v = p[key] || 0;
      defs.push({
        key,
        label,
        type: 'count',
        val: String(v),
        valPh: String(v)
      });
    };

    if (mode === 'hiit') {
      addDuration('prepare', '准备');
      addDuration('work', '锻炼');
      addDuration('rest', '休息');
      addCount('cycles', '周期');
    } else if (mode === 'cycle') {
      addDuration('prepare', '准备');
      addDuration('work', '锻炼');
      addCount('cycles', '周期');
    } else {
      addDuration('prepare', '准备');
      addDuration('lap', '时间回圈');
    }

    this.setData({ settingFields: defs });
  },

  onCloseSetting() {
    this.setData({ showSetting: false });
  },

  // 输入框变化:只保留数字,并按字段做范围截断
  onSettingInput(e) {
    const ds = e.currentTarget.dataset;
    const field = ds.field;
    const index = ds.index;
    let raw = String(e.detail.value == null ? '' : e.detail.value);
    raw = raw.replace(/[^0-9]/g, '');
    if (!raw) {
      this.setData({ ['settingFields[' + index + '].' + field]: '' });
      return;
    }
    let n = parseInt(raw, 10);
    if (field === 'sec') {
      if (n > 59) n = 59;
    } else if (field === 'min') {
      if (n > 999) n = 999;
    } else if (field === 'val') {
      if (n < 1) n = 1;
      if (n > 999) n = 999;
    }
    this.setData({ ['settingFields[' + index + '].' + field]: String(n) });
  },

  // 把面板内 分钟/秒/周期 合并写回 params,并刷新界面
  onConfirmSetting() {
    this._applyPanelToParams();
    this.setData({ showSetting: false });
  },

  // 保存为预设:先应用面板修改,再调用原有 _saveAsPreset
  onSavePreset() {
    this._applyPanelToParams();
    this._saveAsPreset();
    this.setData({ showSetting: false });
  },

  _applyPanelToParams() {
    const fields = this.data.settingFields || [];
    const p = Object.assign({}, this.data.params);
    fields.forEach((f) => {
      if (f.type === 'duration') {
        const m = parseInt(f.min, 10) || 0;
        const s = parseInt(f.sec, 10) || 0;
        p[f.key] = m * 60 + s;
      } else {
        let v = parseInt(f.val, 10);
        if (isNaN(v) || v < 1) v = 1;
        if (v > 999) v = 999;
        p[f.key] = v;
      }
    });
    this._stopRunner();
    this._setMode(this.data.mode, p);
    this._renderIdle();
  },

  noop() {},

  _saveAsPreset() {
    const name = this.data.modeMeta.name;
    storage.addPreset({
      name, type: this.data.mode, params: this.data.params
    });
    wx.showToast({ title: '已保存', icon: 'success' });
  }
});

function paramsTotalForStopwatch(p) {
  return (p.prepare || 0) + 3600 * 4;
}
