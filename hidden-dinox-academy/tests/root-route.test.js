"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { renderRootLoginHtml } = require("../academy/root-page");

const root = path.join(__dirname, "..");

test("root login renderer serves the existing page without redirecting to index.html", () => {
  const source = fs.readFileSync(path.join(root, "public/academy/index.html"), "utf8");
  const rendered = renderRootLoginHtml(source);
  assert.match(rendered, /<base href="\/academy\/">/);
  assert.match(rendered, /<a class="brand" href="\/" aria-label="Hidden Dinox Academy">/);
  assert.match(rendered, /href="css\/auth\.css/);
  assert.match(rendered, /src="js\/config\.js/);
});

test("academy stage navigation works from the clean root URL", () => {
  const config = fs.readFileSync(path.join(root, "public/academy/js/config.js"), "utf8");
  assert.match(config, /login: "\/"/);
  assert.match(config, /broker: "\/academy\/broker\.html"/);
  assert.match(config, /deposit: "\/academy\/deposit\.html"/);
  assert.match(config, /academy: "\/academy\/academy\.html"/);
  const api = fs.readFileSync(path.join(root, "public/academy/js/api.js"), "utf8");
  assert.match(api, /location\.replace\("\/academy\/blocked\.html"\)/);
});
