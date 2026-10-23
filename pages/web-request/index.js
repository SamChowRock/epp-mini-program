const { miniProgramSceneSchema } = require("../../contracts/index");
require("../../page")({
  data: { scene: "" },
  input(e) {
    this.setData({ scene: e.detail.value.toUpperCase() });
  },
  open() {
    return this.run(async () => {
      const scene = miniProgramSceneSchema.safeParse(this.data.scene.trim());
      if (!scene.success) throw Error("请粘贴从网站复制的完整登录码");
      wx.navigateTo({ url: "/pages/web-confirm/index?scene=" + scene.data });
    });
  },
  scan() {
    wx.scanCode({
      onlyFromCamera: true,
      success: (r) => {
        const match = /^pages\/web-confirm\/index\?scene=([A-Z2-7]{26})$/.exec(
          r.path || "",
        );
        const scene = match ? match[1] : r.result;
        this.setData({ scene });
        this.open();
      },
      fail: () => this.setData({ error: "扫描未完成，也可粘贴网站登录码" }),
    });
  },
});
