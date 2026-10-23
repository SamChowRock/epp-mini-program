const { miniProgramSceneSchema } = require("../../contracts/index");
require("../../page")({
  data: { ticket: null, ready: false, remaining: 0 },
  onLoad(options) {
    try {
      this.scene = miniProgramSceneSchema.parse(
        decodeURIComponent(options.scene || ""),
      );
    } catch {
      this.setData({ error: "无效场景码，请回到本人网站重建" });
    }
  },
  onShow() {
    if (this.scene) this.refresh();
  },
  onHide() {
    clearInterval(this.timer);
  },
  onUnload() {
    clearInterval(this.timer);
  },
  async inspect() {
    const result = await this.client.inspect(this.scene);
    this.offset = Date.parse(result.serverTime) - Date.now();
    this.setData({
      ticket: result.ticket,
      siteOrigin: this.client.config.siteOrigin,
    });
    const tick = () =>
      this.setData({
        remaining: Math.max(
          0,
          Math.ceil(
            (Date.parse(result.ticket.expiresAt) - Date.now() - this.offset) /
              1000,
          ),
        ),
      });
    tick();
    clearInterval(this.timer);
    this.timer = setInterval(tick, 1000);
  },
  refresh() {
    return this.run(async () => {
      await this.client.loadConfig();
      await this.client.restore();
      this.setData({
        ready: !!(this.client.session || this.client.hasIdentity),
      });
      if (this.data.ready) await this.inspect();
    });
  },
  confirm() {
    return this.act("confirm");
  },
  cancel() {
    return this.act("cancel");
  },
  act(action) {
    return this.run(async () => {
      const ticket = this.data.ticket;
      try {
        const result = await this.client.act(action, this.scene, ticket);
        this.setData({ ticket: { ...ticket, status: result.status } });
      } catch (error) {
        this.setData({ ticket: null });
        try {
          await this.inspect();
        } catch {}
        throw error;
      }
    });
  },
});
