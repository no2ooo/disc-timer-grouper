/**
 * 翻页时钟页面逻辑
 *
 * 横屏适配说明：
 *  - 未缩放时整个时钟宽度约为 BASE_WIDTH_RPX(632rpx)，时钟真实高度约为 BASE_FACE_HEIGHT_RPX(132rpx，
 *    即 digit-card 高度，已移除底部 CLOCK 标签)。
 *  - 微信小程序 rpx 基准：750rpx = 屏幕宽度，故屏幕高度(以 rpx 计) = 750 * windowHeight / windowWidth。
 *  - 横屏 scale 取「宽度上限」与「高度上限（以时钟面高度为基准）」二者较小值，并限制不低于 0.85，
 *    最后再按宽度上限截断（确保横屏不溢出）。竖屏 scale 固定为 1.0。
 */

// 未缩放时钟基准尺寸（单位 rpx）
const BASE_WIDTH_RPX = 632; // 时钟面总宽（6 卡片 + 边距 + 冒号）
const BASE_FACE_HEIGHT_RPX = 132; // 时钟面（digit-card）高度，已移除底部 CLOCK 标签
// 微信 rpx 基准：750rpx = 屏宽
const SCREEN_WIDTH_RPX = 750;
// 横屏安全边距
const WIDTH_SAFE_RATIO = 0.95; // 缩放后总宽不超过屏宽 95%
const HEIGHT_SAFE_RATIO = 0.45; // 缩放后总高(时钟面)不超过屏高 45%
const MIN_SCALE = 0.85; // scale 下限，避免缩得太小

/**
 * 根据屏幕尺寸计算横屏时钟缩放比例。
 * @param {number} windowWidth 屏幕宽(px)
 * @param {number} windowHeight 屏幕高(px)
 * @returns {number} 计算得到的 scale
 */
function calcLandscapeScale(windowWidth, windowHeight) {
  if (!windowWidth || !windowHeight) {
    return 1.0;
  }
  // 宽度方向上限：缩放后总宽 <= 屏宽 * 95%
  const widthScale = (WIDTH_SAFE_RATIO * SCREEN_WIDTH_RPX) / BASE_WIDTH_RPX;
  // 屏幕高度换算为 rpx（因 rpx 以屏宽为基准）
  const availableHeightRpx = (SCREEN_WIDTH_RPX * windowHeight) / windowWidth;
  // 高度方向上限：缩放后总高(时钟面) <= 屏高 * 45%
  const heightScale = (HEIGHT_SAFE_RATIO * availableHeightRpx) / BASE_FACE_HEIGHT_RPX;

  let scale = Math.min(widthScale, heightScale); // 取二者较小值
  scale = Math.max(scale, MIN_SCALE); // 不小于下限
  scale = Math.min(scale, widthScale); // 宽度上限截断，确保横屏不溢出
  return scale;
}

Page({
  /**
   * 页面的初始数据
   * 每个数字拆分为对象：curr=当前值，prev=上一秒旧值（动画层用），anim=是否正在播放翻页动画。
   */
  data: {
    digits: {
      hh: { curr: '0', prev: '0', anim: false },
      h: { curr: '0', prev: '0', anim: false },
      mm: { curr: '0', prev: '0', anim: false },
      m: { curr: '0', prev: '0', anim: false },
      ss: { curr: '0', prev: '0', anim: false },
      s: { curr: '0', prev: '0', anim: false },
    },
    isLandscape: false,
    // 时钟缩放比例：竖屏 1.0，横屏按屏幕尺寸动态计算
    scale: 1.0,
  },

  /**
   * 定时器引用
   */
  timer: null,

  /**
   * 计算横屏缩放比例（对 calcLandscapeScale 的页面方法封装，便于复用于 onResize / 生命周期）。
   */
  calcLandscapeScale(windowWidth, windowHeight) {
    return calcLandscapeScale(windowWidth, windowHeight);
  },

  /**
   * 根据是否横屏切换 tabBar 显隐。
   * 所有 wx.* 调用都加守卫，避免在 node 测试环境报错。
   * @param {boolean} isLandscape 是否横屏
   */
  toggleTabBar(isLandscape) {
    if (typeof wx !== 'undefined' && wx.hideTabBar && wx.showTabBar) {
      if (isLandscape) {
        wx.hideTabBar({ animation: true, fail: () => {} });
      } else {
        wx.showTabBar({ animation: true, fail: () => {} });
      }
    }
  },

  /**
   * 恢复显示 tabBar（离开页面时调用，避免其它 tab 失去底部导航）。
   */
  restoreTabBar() {
    if (typeof wx !== 'undefined' && wx.showTabBar) {
      wx.showTabBar({ animation: true, fail: () => {} });
    }
  },

  /**
   * 读取系统信息，计算初始 isLandscape / scale 并同步 tabBar 状态。
   */
  syncScreen() {
    let windowWidth = 0;
    let windowHeight = 0;
    if (typeof wx !== 'undefined' && wx.getSystemInfoSync) {
      try {
        const info = wx.getSystemInfoSync();
        windowWidth = (info && info.windowWidth) || 0;
        windowHeight = (info && info.windowHeight) || 0;
      } catch (e) {
        windowWidth = 0;
        windowHeight = 0;
      }
    }
    const isLandscape = windowWidth > windowHeight;
    const scale = isLandscape
      ? this.calcLandscapeScale(windowWidth, windowHeight)
      : 1.0;
    this.setData({ isLandscape, scale });
    this.toggleTabBar(isLandscape);
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad() {
    this.syncScreen();
    this.updateTime();
    this.timer = setInterval(() => this.updateTime(), 1000);
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {
    this.syncScreen();
    if (!this.timer) {
      this.updateTime();
      this.timer = setInterval(() => this.updateTime(), 1000);
    }
  },

  /**
   * 生命周期函数--监听页面隐藏
   */
  onHide() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.restoreTabBar();
  },

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.restoreTabBar();
  },

  /**
   * 页面尺寸变化时触发，用于自动切换横屏/竖屏布局
   */
  onResize(res) {
    const size = res && res.size ? res.size : {};
    const windowWidth = size.windowWidth || 0;
    const windowHeight = size.windowHeight || 0;
    const isLandscape = windowWidth > windowHeight;
    const scale = isLandscape
      ? this.calcLandscapeScale(windowWidth, windowHeight)
      : 1.0;
    this.setData({ isLandscape, scale });
    this.toggleTabBar(isLandscape);
  },

  /**
   * 更新当前时间，拆分为 6 个独立数字。
   * 当某个数字相对上一秒发生变化时，记录旧值到 prev、新值到 curr，并开启翻页动画。
   */
  updateTime() {
    const now = new Date();
    const pad = (n) => (n < 10 ? '0' + n : '' + n);
    const timeStr = pad(now.getHours()) + pad(now.getMinutes()) + pad(now.getSeconds());
    const keys = ['hh', 'h', 'mm', 'm', 'ss', 's'];
    const update = {};
    keys.forEach((k, i) => {
      const newVal = timeStr.charAt(i);
      const old = this.data.digits[k];
      if (old.curr !== newVal) {
        update[`digits.${k}.prev`] = old.curr;
        update[`digits.${k}.curr`] = newVal;
        update[`digits.${k}.anim`] = true;
      }
    });
    if (Object.keys(update).length > 0) {
      this.setData(update);
    }
  },

  /**
   * 单个数字的翻页动画结束后触发（bindanimationend）。
   * 将该数字的 anim 复位为 false，移除动画层，恢复静态显示。
   */
  onFlipEnd(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ [`digits.${key}.anim`]: false });
  },
});
