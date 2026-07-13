// pages/preset/preset.js
const app = getApp();
const storage = require('../../utils/storage.js');
const notify = require('../../utils/notify.js');

const TYPE_LABELS = {
  hiit: '高强度间歇',
  cycle: '周期',
  stopwatch: '秒表'
};

Page({
  data: {
    presets: []
  },

  onShow() {
    this._load();
  },

  _load() {
    const list = storage.get('presets') || [];
    this.setData({
      presets: list.map(p => ({
        id: p.id,
        name: p.name,
        typeLabel: TYPE_LABELS[p.type] || p.type,
        summary: this._summarize(p.type, p.params),
        timeLabel: formatAgo(p.createdAt)
      }))
    });
  },

  _summarize(type, p) {
    if (type === 'hiit') return `准备 ${p.prepare}s · 锻炼 ${p.work}s · 休息 ${p.rest}s · 周期 ${p.cycles}`;
    if (type === 'cycle') return `准备 ${p.prepare}s · 锻炼 ${p.work}s · 周期 ${p.cycles}`;
    if (type === 'stopwatch') return `准备 ${p.prepare}s · 每 ${p.lap}s 响一次`;
    return '';
  },

  onApplyPreset(e) {
    notify.tap();
    const id = e.currentTarget.dataset.id;
    const item = (storage.get('presets') || []).find(x => x.id === id);
    if (!item) return;
    // 应用预设:写入全局 storage 并切换到计时页
    wx.setStorageSync('lastParams_' + item.type, item.params);
    wx.setStorageSync('pendingMode', item.type);
    wx.switchTab({ url: '/pages/index/index' });
  },

  onLongPressPreset(e) {
    notify.tap();
    const id = e.currentTarget.dataset.id;
    wx.showActionSheet({
      itemList: ['删除该预设', '取消'],
      success: (res) => {
        if (res.tapIndex === 0) {
          storage.removePreset(id);
          this._load();
          wx.showToast({ title: '已删除', icon: 'success' });
        }
      }
    });
  }
});

function formatAgo(ts) {
  const diff = Date.now() - ts;
  if (diff < 60 * 1000) return '刚刚';
  if (diff < 3600 * 1000) return Math.floor(diff / 60000) + ' 分钟前保存';
  if (diff < 86400 * 1000) return Math.floor(diff / 3600000) + ' 小时前保存';
  return new Date(ts).toLocaleDateString() + ' 保存';
}
