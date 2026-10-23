require("../../page")({
  data: {
    q: "",
    submittedQ: "",
    rows: [],
    nextCursor: null,
    ready: false,
    queryEnabled: false,
  },
  async onShow() {
    await this.run(async () => {
      const config = await this.client.loadConfig();
      await this.client.restore();
      this.setData({
        ready: !!this.client.session,
        queryEnabled: config.queryEnabled,
      });
      if (this.client.session && config.queryEnabled && !this.data.rows.length)
        await this.load(false);
    });
  },
  input(e) {
    this.setData({ q: e.detail.value });
  },
  search() {
    wx.hideKeyboard();
    return this.run(() => this.load(false));
  },
  more() {
    return this.run(() => this.load(true));
  },
  clearSearch() {
    this.setData({ q: "" });
    return this.search();
  },
  copySite() {
    wx.setClipboardData({
      data: this.client.config.siteOrigin,
      fail: () => this.setData({ error: "复制失败，请重试" }),
    });
  },
  async load(append) {
    const generation = (this.generation || 0) + 1;
    this.generation = generation;
    const q = append ? this.data.submittedQ : this.data.q.trim();
    const result = await this.client.list({
      ...(q ? { q } : {}),
      ...(append && this.data.nextCursor
        ? { cursor: this.data.nextCursor }
        : {}),
    });
    if (generation !== this.generation) return;
    const rows = append
      ? [
          ...new Map(
            [...this.data.rows, ...result.data].map((row) => [row.id, row]),
          ).values(),
        ]
      : result.data;
    this.setData({ rows, nextCursor: result.nextCursor, submittedQ: q });
  },
  detail(e) {
    wx.navigateTo({
      url: "/pages/unit-detail/index?unitId=" + e.currentTarget.dataset.id,
    });
  },
});
