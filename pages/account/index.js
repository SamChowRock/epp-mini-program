require("../../page")({
  data: { session: null, logoutFailed: false },
  onShow() {
    this.run(async () => {
      await this.client.loadConfig();
      await this.client.restore();
      this.setData({ session: this.client.session });
    });
  },
  logout() {
    this.run(async () => {
      try {
        await this.client.logout();
        this.setData({ session: null, logoutFailed: false });
      } catch (error) {
        this.setData({ logoutFailed: true });
        throw error;
      }
    });
  },
  clearLocal() {
    wx.showModal({
      title: "仅清除本机登录",
      content:
        "服务端撤销未确认成功。清除后本机不再使用此凭据，但远端会话可能仍有效；请到网站微信与小程序账号页撤销。",
      confirmText: "清除本机",
      success: (r) => {
        if (r.confirm) {
          this.client.clear();
          this.setData({
            session: null,
            logoutFailed: false,
            error: "已清除本机凭据；服务端撤销尚未确认，请到网站处理。",
          });
        }
      },
    });
  },
  identity() {
    wx.navigateTo({ url: "/pages/identity/index" });
  },
  website() {
    wx.navigateTo({ url: "/pages/web-request/index" });
  },
});
