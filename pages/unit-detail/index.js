require("../../page")({
  data: { unit: null },
  onLoad(options) {
    this.unitId = options.unitId;
  },
  onShow() {
    this.run(async () => {
      this.setData({ unit: null });
      await this.client.restore();
      const result = await this.client.detail(this.unitId);
      this.setData({ unit: result.unit });
    });
  },
  retry() {
    this.onShow();
  },
  copy() {
    wx.setClipboardData({
      data: this.data.unit.canonicalForm,
      fail: () => this.setData({ error: "复制失败，请重试" }),
    });
  },
});
