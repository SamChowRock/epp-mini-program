module.exports = function page(definition) {
  const originalLoad = definition.onLoad;
  const originalUnload = definition.onUnload;
  const data = { error: "", busy: false, ...definition.data };
  Page({
    ...definition,
    data,
    onLoad(options) {
      this.client = getApp().client;
      this.unsubscribe = this.client.subscribe(() => {
        this.generation = (this.generation || 0) + 1;
        this.setData({
          ready: false,
          q: "",
          submittedQ: "",
          nextCursor: null,
          rows: [],
          unit: null,
          ticket: null,
          session: null,
          error: "登录已失效，请重新登录",
        });
      });
      if (originalLoad) originalLoad.call(this, options);
    },
    onUnload() {
      this.generation = (this.generation || 0) + 1;
      this.unsubscribe?.();
      originalUnload?.call(this);
    },
    async run(task) {
      if (this.data.busy) return;
      this.setData({ busy: true, error: "" });
      try {
        await task();
      } catch (error) {
        this.setData({ error: error.message || "请求失败，请重试" });
      } finally {
        this.setData({ busy: false });
      }
    },
    login() {
      return this.run(async () => {
        const config = await this.client.loadConfig();
        const agreed = await new Promise((resolve) =>
          wx.showModal({
            title: "阅读并同意隐私说明",
            content:
              config.privacy.text + "\n支持：" + config.privacy.supportContact,
            confirmText: "同意登录",
            success: (r) => resolve(r.confirm),
            fail: () => resolve(false),
          }),
        );
        if (!agreed) return;
        const result = await this.client.login();
        if (result.status === "unbound")
          wx.navigateTo({ url: "/pages/identity/index" });
        else {
          this.setData({ ready: true, session: this.client.session });
        }
      }).then(() => {
        if (this.client.session) this.onShow?.();
      });
    },
    privacy() {
      wx.navigateTo({ url: "/pages/privacy/index" });
    },
    home() {
      wx.switchTab({ url: "/pages/star-map/index" });
    },
  });
};
