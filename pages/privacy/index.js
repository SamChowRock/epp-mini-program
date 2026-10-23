require("../../page")({
  data: { privacy: null },
  onShow() {
    this.run(async () => {
      const config = await this.client.loadConfig();
      this.setData({ privacy: config.privacy });
    });
  },
  copy() {
    wx.setClipboardData({
      data:
        this.data.privacy.accountActionsUrl || this.data.privacy.supportContact,
      fail: () => this.setData({ error: "复制失败，请手动选择文本" }),
    });
  },
});
