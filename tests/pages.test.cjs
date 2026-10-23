const { test } = require("node:test");
const assert = require("node:assert/strict");

function loadPage(name, client) {
  let definition;
  global.Page = (value) => {
    definition = value;
  };
  const path = require.resolve("../pages/" + name + "/index.js");
  delete require.cache[path];
  require(path);
  delete global.Page;
  return {
    ...definition,
    data: { ...definition.data },
    client,
    setData(value) {
      Object.assign(this.data, value);
    },
  };
}

test("website entry and existing-account linking use ordinary pages with native back navigation", () => {
  const app = require("../app.json");
  const calls = [];
  global.wx = {
    navigateTo: ({ url }) => {
      assert.ok(app.pages.includes(url.slice(1)));
      assert.ok(!app.tabBar.list.some((tab) => "/" + tab.pagePath === url));
      calls.push(url);
    },
    switchTab: ({ url }) => {
      assert.ok(app.tabBar.list.some((tab) => "/" + tab.pagePath === url));
      calls.push(url);
    },
  };
  try {
    assert.equal(app.pages[0], "pages/star-map/index");
    for (const path of app.pages)
      assert.equal(typeof require("../" + path + ".json"), "object");
    assert.deepEqual(app.tabBar.list.map((tab) => tab.text), ["星图", "账号"]);
    loadPage("account", {}).website();
    loadPage("identity", {}).existing();
    loadPage("web-request", {}).home();
    assert.deepEqual(calls, [
      "/pages/web-request/index",
      "/pages/web-request/index",
      "/pages/star-map/index",
    ]);
  } finally {
    delete global.wx;
  }
});

test("manual and scanned scenes inspect the same request and never confirm on entry or login recovery", async () => {
  const scene = "A".repeat(26);
  const calls = [];
  let confirm;
  global.wx = { navigateTo: ({ url }) => calls.push(url) };
  try {
    const manual = loadPage("web-request", {});
    manual.input({ detail: { value: "bad" } });
    await manual.open();
    assert.equal(manual.data.error, "请粘贴从网站复制的完整登录码");
    assert.deepEqual(calls, []);
    manual.input({ detail: { value: scene.toLowerCase() } });
    await manual.open();
    assert.deepEqual(calls, ["/pages/web-confirm/index?scene=" + scene]);
    let signedIn = false;
    const client = {
      config: { siteOrigin: "http://localhost:5173" },
      session: null,
      subscribe: () => () => {},
      loadConfig: async () => {},
      restore: async () => {
        if (signedIn) client.session = { user: { id: "synthetic-user" } };
      },
      inspect: async (value) => {
        assert.equal(value, scene);
        return {
          serverTime: new Date().toISOString(),
          ticket: {
            status: "PENDING",
            expiresAt: new Date(Date.now() + 300000).toISOString(),
          },
        };
      },
      act: () => assert.fail("opening or restoring a request must never confirm it"),
    };
    global.getApp = () => ({ client });
    confirm = loadPage("web-confirm", client);
    confirm.onLoad({ scene });
    await confirm.refresh();
    assert.equal(confirm.scene, scene);
    assert.equal(confirm.data.ready, false);
    signedIn = true;
    await confirm.refresh();
    assert.equal(confirm.data.ticket.status, "PENDING");
  } finally {
    confirm?.onUnload();
    delete global.getApp;
    delete global.wx;
  }
});

test("disposal confirmation submits only the server-issued purpose ticket", async () => {
  const calls = [];
  const page = loadPage("web-confirm", {
    act: async (...args) => {
      calls.push(args);
      return { status: "CONFIRMED" };
    },
  });
  const ticket = {
    requestId: "synthetic-ticket",
    purpose: "account_disposal_reauth",
    targetAccount: { nickname: "Synthetic" },
    status: "PENDING",
  };
  page.scene = "A".repeat(26);
  page.data.ticket = ticket;
  assert.equal(calls.length, 0);
  await page.confirm();
  assert.deepEqual(calls, [["confirm", page.scene, ticket]]);
  assert.equal(page.data.ticket.status, "CONFIRMED");
  assert.equal(page.data.ticket.purpose, "account_disposal_reauth");
  assert.equal(Object.hasOwn(page.client, "deleteAccount"), false);
});

test("draft keyword never changes the submitted cursor query and appended IDs are unique", async () => {
  const calls = [];
  const results = [
    {
      data: [{ id: "one", canonicalForm: "first" }],
      nextCursor: "old-query-cursor",
    },
    {
      data: [{ id: "one", canonicalForm: "updated" }, { id: "two" }],
      nextCursor: null,
    },
  ];
  const page = loadPage("star-map", {
    list: async (query) => {
      calls.push(query);
      return results.shift();
    },
  });
  page.input({ detail: { value: "old query" } });
  await page.load(false);
  page.input({ detail: { value: "new draft" } });
  await page.load(true);
  assert.deepEqual(calls, [
    { q: "old query" },
    { q: "old query", cursor: "old-query-cursor" },
  ]);
  assert.equal(page.data.q, "new draft");
  assert.equal(page.data.submittedQ, "old query");
  assert.deepEqual(
    page.data.rows.map((row) => row.id),
    ["one", "two"],
  );
  assert.equal(page.data.rows[0].canonicalForm, "updated");
});

test("a late search response cannot overwrite a more recent submitted result", async () => {
  const pending = [];
  const page = loadPage("star-map", {
    list: () => new Promise((resolve) => pending.push(resolve)),
  });
  page.input({ detail: { value: "first" } });
  const first = page.load(false);
  page.input({ detail: { value: "second" } });
  const second = page.load(false);
  pending[1]({ data: [{ id: "new" }], nextCursor: "new-cursor" });
  await second;
  pending[0]({ data: [{ id: "old" }], nextCursor: "old-cursor" });
  await first;
  assert.equal(page.data.submittedQ, "second");
  assert.deepEqual(page.data.rows, [{ id: "new" }]);
  assert.equal(page.data.nextCursor, "new-cursor");
});

test("failed logout offers explicit local clear without claiming server revocation", async () => {
  let clearCount = 0,
    modal;
  global.wx = {
    showModal: (options) => {
      modal = options;
    },
  };
  const page = loadPage("account", {
    logout: async () => {
      throw Error("network failed");
    },
    clear: () => {
      clearCount++;
    },
  });
  page.data.session = { user: { id: "user" } };
  page.logout();
  await new Promise(setImmediate);
  assert.equal(page.data.logoutFailed, true);
  assert.ok(page.data.session);
  assert.equal(clearCount, 0);
  page.clearLocal();
  assert.match(modal.content, /服务端撤销未确认成功/);
  modal.success({ confirm: false });
  assert.equal(clearCount, 0);
  modal.success({ confirm: true });
  assert.equal(clearCount, 1);
  assert.equal(page.data.session, null);
  assert.match(page.data.error, /服务端撤销尚未确认/);
  delete global.wx;
});
