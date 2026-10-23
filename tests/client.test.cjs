const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { createClient } = require("../client");
const token = "A".repeat(43),
  id = "11111111-1111-4111-8111-111111111111",
  time = new Date(Date.now() + 300000).toISOString();
const config = {
  apiVersion: "mini-program.v1",
  serviceName: "EPP",
  siteOrigin: "http://localhost:5174",
  queryEnabled: true,
  webTicketEnabled: true,
  privacy: {
    version: "v1",
    text: "Fake notice",
    supportContact: "local",
    accountActionsUrl: null,
  },
  serverTime: time,
};
function setup() {
  const store = {};
  const calls = [];
  let response = config;
  const wx = {
    getStorageSync: (k) => store[k],
    setStorageSync: (k, v) => (store[k] = v),
    removeStorageSync: (k) => delete store[k],
    login() {
      throw Error("real wx.login forbidden");
    },
    request(input) {
      calls.push(input);
      input.success({ statusCode: 200, data: response });
    },
  };
  return {
    wx,
    client: createClient(wx, {
      mode: "fake",
      environment: "local",
      apiBaseUrl: "http://localhost:3002",
      fakeIdentity: "demo",
    }),
    calls,
    store,
    set: (value) => (response = value),
  };
}
test("used identity contexts clear local credentials and show a recovery instruction", async () => {
  const x = setup();
  await x.client.loadConfig();
  x.set({
    status: "unbound",
    identityToken: token,
    expiresAt: time,
    serverTime: new Date().toISOString(),
  });
  await x.client.login();
  x.wx.request = (input) =>
    input.success({ statusCode: 409, data: { code: "MP_CONTEXT_USED" } });
  await assert.rejects(
    x.client.register(),
    (error) =>
      error.code === "MP_CONTEXT_USED" && /重新登录/.test(error.message),
  );
  assert.equal(x.client.hasIdentity, false);
  assert.deepEqual(x.store, {});
});
test("Fake exchange has unique codes and never persists an identity context", async () => {
  const x = setup();
  await x.client.loadConfig();
  x.set({
    status: "unbound",
    identityToken: token,
    expiresAt: time,
    serverTime: time,
  });
  await x.client.login();
  await x.client.login();
  assert.notEqual(x.calls[1].data.code, x.calls[2].data.code);
  assert.match(x.calls[1].data.code, /^fake.demo./);
  assert.deepEqual(x.store, {});
  assert.equal(x.calls[1].header.Authorization, undefined);
});
test("register explicitly upgrades I to S; logout revokes server before clearing", async () => {
  const x = setup();
  await x.client.loadConfig();
  x.set({
    status: "unbound",
    identityToken: token,
    expiresAt: time,
    serverTime: new Date().toISOString(),
  });
  await x.client.login();
  x.set({
    status: "authenticated",
    token,
    session: {
      id,
      user: { id, displayName: "Fake" },
      expiresAt: time,
      idleExpiresAt: time,
    },
    serverTime: time,
  });
  await x.client.register();
  assert.equal(x.calls[2].header.Authorization, "Bearer " + token);
  assert.equal(x.store["epp-mini-session"], token);
  x.set({ status: "revoked" });
  await x.client.logout();
  assert.equal(x.calls[3].url.endsWith("/logout"), true);
  assert.equal(x.client.session, null);
  assert.deepEqual(x.store, {});
});
test("production rejects Fake and remote HTTP", () => {
  assert.throws(() =>
    createClient(
      {},
      {
        environment: "production",
        mode: "fake",
        apiBaseUrl: "https://example.com",
      },
    ),
  );
  assert.throws(() =>
    createClient(
      {},
      { environment: "local", mode: "fake", apiBaseUrl: "http://example.com" },
    ),
  );
});
test("CommonJS Shared bundle has no external require or Node globals", () => {
  const source = fs.readFileSync(
    require.resolve("../contracts/index.js"),
    "utf8",
  );
  assert.equal(/require\(/.test(source), false);
  const exports = {};
  vm.runInNewContext(source, { exports });
  assert.ok(exports.miniProgramExchangeResponseSchema);
  assert.equal(exports.miniProgramSceneSchema.safeParse("bad").success, false);
  assert.equal(
    exports.miniProgramConfigResponseSchema.safeParse(config).success,
    true,
  );
});
test("native client validates without dynamic function generation in the WeChat sandbox", async () => {
  const schemas = {};
  let functionCalls = 0;
  vm.runInNewContext(
    fs.readFileSync(require.resolve("../contracts/index.js"), "utf8"),
    {
      exports: schemas,
      Function: function () {
        functionCalls++;
        return {};
      },
    },
  );
  const probeCalls = functionCalls;
  let response = config;
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(require.resolve("../client.js"), "utf8"), {
    module,
    require: (path) => {
      assert.equal(path, "./contracts/index.js");
      return schemas;
    },
  });
  const client = module.exports.createClient(
    {
      getStorageSync: () => null,
      request: (options) => options.success({ statusCode: 200, data: response }),
    },
    { mode: "fake", environment: "local", apiBaseUrl: "http://localhost:3002" },
  );
  assert.equal((await client.loadConfig()).apiVersion, "mini-program.v1");
  response = { ...config, unexpected: true };
  await assert.rejects(client.loadConfig(), /unrecognized_keys/);
  assert.equal(
    functionCalls,
    probeCalls,
    "parsing must not invoke the JIT compiler",
  );
});
test("identity context cannot query star map or confirm login", async () => {
  const x = setup();
  await x.client.loadConfig();
  x.set({
    status: "unbound",
    identityToken: token,
    expiresAt: time,
    serverTime: new Date().toISOString(),
  });
  await x.client.login();
  assert.throws(() => x.client.list({}));
  assert.throws(() => x.client.detail(id));
  assert.throws(() =>
    x.client.act("confirm", "A".repeat(26), {
      requestId: id,
      purpose: "login",
    }),
  );
  assert.equal(x.calls.length, 2);
});
test("a response arriving after account clear cannot repopulate credentials", async () => {
  const x = setup();
  await x.client.loadConfig();
  let pending;
  x.wx.request = (input) => (pending = input);
  const login = x.client.login();
  x.client.clear();
  pending.success({
    statusCode: 200,
    data: {
      status: "unbound",
      identityToken: token,
      expiresAt: time,
      serverTime: new Date().toISOString(),
    },
  });
  await assert.rejects(login, /账号状态已改变/);
  assert.equal(x.client.hasIdentity, false);
  assert.deepEqual(x.store, {});
});
