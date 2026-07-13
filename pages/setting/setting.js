// pages/setting/setting.js
const app = getApp();
const storage = require('../../utils/storage.js');
const notify = require('../../utils/notify.js');

Page({
  data: {
    settings: {}
  },

  onShow() {
    this.setData({ settings: Object.assign({}, app.globalData.settings) });
  },

  onChange(e) {
    notify.tap();
    const key = e.currentTarget.dataset.key;
    const val = e.detail.value;
    const next = Object.assign({}, this.data.settings);
    next[key] = val;
    this.setData({ settings: next });
    app.setSettings({ [key]: val });
  },

  onClearAll() {
    notify.tap();
    wx.showModal({
      title: '清除全部数据',
      content: '将删除所有预设、分组历史、偏好设置,确定吗?',
      confirmColor: '#ff5c5c',
      success: (res) => {
        if (res.confirm) {
          try {
            wx.clearStorageSync();
            app.globalData.settings = {
              sound: true, vibrate: true, voice: false, keepScreen: true,
              nightFlash: false, warnVolume: true, rotate: false
            };
            this.setData({ settings: app.globalData.settings });
            wx.showToast({ title: '已清除', icon: 'success' });
          } catch (e) {
            wx.showToast({ title: '清除失败', icon: 'none' });
          }
        }
      }
    });
  }
});
