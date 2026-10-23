const schemas = require("./contracts/index.js");
// WeChat's Function stub passes Zod's feature probe but cannot run JIT parsers.
const parseOptions = { jitless: true };
const errorText = {
  MP_DISABLED: "服务暂未启用，请稍后再试",
  MP_ACCOUNT_UNAVAILABLE: "账号当前不可用，请联系支持渠道",
  MP_SESSION_INVALID: "登录已失效，请重新登录",
  MP_IDENTITY_CONTEXT_INVALID: "身份核验已过期，请重新登录",
  MP_CONTEXT_USED: "此身份核验已用于其他请求，请重新登录",
  MP_WECHAT_CODE_INVALID: "登录凭证无效或已使用，请重新登录",
  MP_WECHAT_UNAVAILABLE: "微信服务暂不可用，请稍后重新登录",
  MP_PRIVACY_NOTICE_CHANGED: "隐私说明已更新，请重新阅读并同意",
  MP_IDENTITY_ALREADY_BOUND:
    "该微信已关联账号，请重新登录原账号，不支持转移数据",
  MP_TICKET_PROCESSED: "请求已处理，请回原网站核对或重新创建",
  MP_TICKET_EXPIRED: "请求已过期，请回原网站重新创建",
  MP_REAUTH_REQUIRED: "网站账号需要重新认证，请回原网站处理",
  MP_CURSOR_INVALID: "查询条件已变化，请重新搜索",
  MP_RATE_LIMITED: "请求过于频繁，请稍后重试",
  MP_NOT_FOUND: "内容已不存在或当前不可查看",
  MP_INPUT_INVALID: "输入内容无效，请检查后重试",
  MP_CAPABILITY_DENIED: "当前登录身份不能执行此操作，请核对账号与请求用途",
  MP_ORIGIN_OR_CSRF_INVALID: "无法核对发起浏览器，请回原网站重新创建请求",
};
function createClient(wx, config) {
  if (!["fake", "wechat"].includes(config.mode))
    throw Error("未知微信运行模式");
  const release =
    wx.getAccountInfoSync?.().miniProgram?.envVersion === "release";
  const secure = /^https:\/\/[^/]+$/.test(config.apiBaseUrl);
  if (
    (config.environment === "production" || release) &&
    (config.mode === "fake" || !secure)
  )
    throw Error("生产环境禁止 Fake 或 HTTP");
  if (
    !secure &&
    !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(config.apiBaseUrl)
  )
    throw Error("HTTP 仅允许本地隔离实例");
  let token = wx.getStorageSync("epp-mini-session") || null;
  let identityToken = null;
  let identityExpiresAt = 0;
  let session = null;
  let configView = null;
  let epoch = 0;
  const listeners = new Set();
  function clear() {
    epoch++;
    token = identityToken = session = null;
    wx.removeStorageSync("epp-mini-session");
    listeners.forEach((fn) => fn());
  }
  async function request(
    path,
    schema,
    body,
    credential = token || identityToken,
    method = body === undefined ? "GET" : "POST",
  ) {
    const startedEpoch = epoch;
    if (
      credential &&
      credential === identityToken &&
      Date.now() >= identityExpiresAt
    ) {
      clear();
      throw Error("身份核验已过期，请重新登录");
    }
    const result = await new Promise((resolve, reject) =>
      wx.request({
        url: config.apiBaseUrl + "/api/mini-program" + path,
        method,
        data: body,
        timeout: 10000,
        header: credential ? { Authorization: "Bearer " + credential } : {},
        success: resolve,
        fail: () => reject(Error("网络失败，请手动重试")),
      }),
    );
    if (startedEpoch !== epoch) throw Error("账号状态已改变，请重新读取");
    if (result.statusCode < 200 || result.statusCode >= 300) {
      if (
        result.statusCode === 401 ||
        result.data?.code === "MP_CONTEXT_USED" ||
        result.data?.code === "MP_ACCOUNT_UNAVAILABLE"
      )
        clear();
      const error = Error(
        errorText[result.data?.code] || "请求失败，请检查输入或稍后重试",
      );
      error.code = result.data?.code;
      error.retryAt = result.data?.retryAt;
      throw error;
    }
    return schema.parse(result.data, parseOptions);
  }
  function accept(result) {
    if (result.status === "authenticated") {
      token = result.token;
      identityToken = null;
      session = result.session;
      wx.setStorageSync("epp-mini-session", token);
    } else {
      token = null;
      identityToken = result.identityToken;
      identityExpiresAt =
        Date.now() +
        Math.max(
          0,
          Date.parse(result.expiresAt) - Date.parse(result.serverTime),
        );
      session = null;
      wx.removeStorageSync("epp-mini-session");
    }
    return result;
  }
  return {
    get session() {
      return session;
    },
    get hasIdentity() {
      return !!identityToken;
    },
    get config() {
      return configView;
    },
    clear,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    async loadConfig() {
      configView = await request(
        "/config",
        schemas.miniProgramConfigResponseSchema,
        undefined,
        null,
      );
      return configView;
    },
    async restore() {
      if (!token) return null;
      const result = await request(
        "/session",
        schemas.miniProgramSessionResponseSchema,
      );
      session = result.session;
      return session;
    },
    async login() {
      if (!configView) throw Error("请先阅读隐私说明");
      let code;
      if (config.mode === "fake")
        code =
          "fake." +
          config.fakeIdentity +
          "." +
          Date.now() +
          "-" +
          Math.random().toString(36).slice(2);
      else
        code = await new Promise((resolve, reject) =>
          wx.login({
            success: (r) =>
              r.code ? resolve(r.code) : reject(Error("登录失败")),
            fail: reject,
          }),
        );
      return accept(
        await request(
          "/auth/exchange",
          schemas.miniProgramExchangeResponseSchema,
          { code, noticeVersion: configView.privacy.version },
          null,
        ),
      );
    },
    async register() {
      if (!identityToken) throw Error("请重新登录");
      return accept(
        await request(
          "/auth/register",
          schemas.miniProgramAuthenticatedResponseSchema,
          { noticeVersion: configView.privacy.version },
          identityToken,
        ),
      );
    },
    async logout() {
      if (token)
        await request("/logout", schemas.miniProgramRevokeResponseSchema, {});
      clear();
    },
    list(query) {
      if (!token) throw Error("请先登录本人账号");
      const parsed = schemas.miniProgramListQuerySchema.parse(
        query,
        parseOptions,
      );
      const params = Object.entries(parsed)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => encodeURIComponent(k) + "=" + encodeURIComponent(v))
        .join("&");
      return request(
        "/star-map?" + params,
        schemas.miniProgramListResponseSchema,
      );
    },
    detail(id) {
      if (!token) throw Error("请先登录本人账号");
      schemas.miniProgramUnitDetailSchema.shape.id.parse(id, parseOptions);
      return request(
        "/star-map/units/" + encodeURIComponent(id),
        schemas.miniProgramUnitResponseSchema,
      );
    },
    inspect(scene) {
      return request(
        "/tickets/inspect",
        schemas.miniProgramTicketInspectResponseSchema,
        schemas.miniProgramTicketInspectRequestSchema.parse(
          { scene },
          parseOptions,
        ),
      );
    },
    act(action, scene, ticket) {
      if (!token && (ticket.purpose === "login" || !identityToken))
        throw Error("网站登录需先选择或创建账号；已有账号请改用网站关联请求");
      const body = schemas.miniProgramTicketConfirmRequestSchema.parse(
        {
          scene,
          requestId: ticket.requestId,
          expectedPurpose: ticket.purpose,
        },
        parseOptions,
      );
      return request(
        "/tickets/" + action,
        action === "confirm"
          ? schemas.miniProgramTicketConfirmResponseSchema
          : schemas.miniProgramTicketCancelResponseSchema,
        body,
      );
    },
  };
}
module.exports = { createClient };
