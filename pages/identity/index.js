require("../../page")({
  register() {
    this.run(async () => {
      await this.client.register();
      wx.navigateBack({
        fail: () => wx.switchTab({ url: "/pages/star-map/index" }),
      });
    });
  },
  existing() {
    wx.navigateTo({ url: "/pages/web-request/index" });
  },
  leave() {
    this.client.clear();
    wx.switchTab({ url: "/pages/account/index" });
  },
});
