// app.js
App({
  globalData: {
    // 主题色与全局偏好
    theme: {
      bg: '#0a0a0a',
      card: '#1a1a1a',
      cardHi: '#222222',
      yellow: '#f6ff5c',
      green: '#b5f25c',
      red: '#ff5c5c',
      blue: '#5cb8ff',
      text: '#ffffff',
      sub: '#9a9a9a',
      divider: '#262626'
    },
    // 用户偏好(运行时从 storage 同步)
    settings: {
      sound: true,        // 声音
      vibrate: true,      // 振动
      voice: false,       // 语音播报
      keepScreen: true,   // 屏幕常亮(以"work in background"思路,需 keepScreenOn 替代)
      nightFlash: false,  // 闪屏
      warnVolume: true,   // 警示时降低音量
      rotate: false       // 允许屏幕旋转
    }
  },

  onLaunch() {
    // 同步本地偏好
    const s = wx.getStorageSync('settings');
    if (s && typeof s === 'object') {
      this.globalData.settings = Object.assign(this.globalData.settings, s);
    }
    // 检查 storage 中是否已有预设
    if (!wx.getStorageSync('presets')) {
      wx.setStorageSync('presets', []);
    }
    if (!wx.getStorageSync('groupHistory')) {
      wx.setStorageSync('groupHistory', []);
    }
  },

  // 跨页同步设置:任何页面 setSettings 后,其他页面 onShow 自动从 globalData 读
  setSettings(patch) {
    this.globalData.settings = Object.assign({}, this.globalData.settings, patch);
    wx.setStorageSync('settings', this.globalData.settings);
  }
});
