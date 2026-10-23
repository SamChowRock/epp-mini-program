const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readdirSync, readFileSync } = require("node:fs");
const { join } = require("node:path");

// WXML treats bare expression strings as truthy text, including "false".
// Check directive/boolean attributes structurally, independently of page copy.
function templateErrors(source) {
  const errors = [];
  const tags = source.match(/<[\w-]+\b(?:[^"'>]|"[^"]*"|'[^']*')*>/g) || [];
  for (const tag of tags) {
    const attrs = [...tag.matchAll(/([\w:-]+)(?:\s*=\s*("[^"]*"|'[^']*'))?/g)];
    const controlledInput =
      /^<input\b/.test(tag) && /\bbind(?::)?input\s*=/.test(tag);
    for (const [, name, quoted] of attrs) {
      const value = quoted?.slice(1, -1);
      const directive = /^wx:(if|elif|for)$/.test(name);
      const boolean =
        /^(hidden|disabled|checked|selected|focus|loading|password)$/.test(
          name,
        );
      const controlledValue = controlledInput && name === "value";
      if ((directive || boolean || controlledValue) && value?.includes("&amp;"))
        errors.push(name + " must use raw WXML expression operators");
      if (
        (directive || controlledValue || (boolean && value !== undefined)) &&
        (!value || !/^\s*{{[\s\S]+}}\s*$/.test(value))
      )
        errors.push(name + " must use {{expression}}");
      if (name === "wx:else" && value !== undefined)
        errors.push("wx:else must not have a value");
      if (
        name.startsWith("data-") &&
        value &&
        !value.includes("{{") &&
        /\b(?:item|index)\./.test(value)
      )
        errors.push(name + " has an unbound loop reference");
    }
  }
  return errors;
}

test("template lint catches truthy-string conditions, loops and interaction bindings", () => {
  for (const template of [
    '<view wx:if="!ready"/>',
    '<view wx:elif="ticket"/>',
    '<view wx:for="rows"/>',
    "<view wx:if/>",
    '<button hidden="false"/>',
    '<button disabled="busy"/>',
    '<switch checked="false"/>',
    '<input value="scene" bindinput="input"/>',
    '<button data-id="item.id"/>',
    '<view wx:if="{{!rows.length &amp;&amp; !busy}}"/>',
  ])
    assert.ok(templateErrors(template).length, template);
  assert.deepEqual(
    templateErrors(
      '<block wx:if="{{ticket.status === \'PENDING\' && remaining > 0}}"><button disabled="{{busy}}" data-id="{{item.id}}"/><input value="{{scene}}" bindinput="input"/></block><block wx:else/><view wx:for="{{rows}}" wx:key="id"/>',
    ),
    [],
  );
});

test("all native templates bind conditions, iterations and interactive state", () => {
  function inspect(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) inspect(path);
      else if (path.endsWith(".wxml"))
        assert.deepEqual(templateErrors(readFileSync(path, "utf8")), [], path);
    }
  }
  inspect(join(__dirname, "../pages"));
});
