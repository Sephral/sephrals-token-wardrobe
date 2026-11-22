import assert from "node:assert/strict";
import test from "node:test";
import {GROUPS, REFRESH_HOOK, touched} from "../scripts/refresh-logic.mjs";

const ID = "sephrals-token-wardrobe";

test("the hook is the translator's", () => {
  assert.equal(REFRESH_HOOK, "sephrals-translator.refresh");
});

test("stage keys touch the stage texts", () => {
  assert.deepEqual(touched({moduleId: ID, keys: ["STW.Stage.title"]}, ID), {title: true, hints: false});
  assert.deepEqual(touched({moduleId: ID, keys: ["STW.Stage.realName"]}, ID), {title: false, hints: true});
});

test("other keys, other modules and null keys", () => {
  assert.deepEqual(touched({moduleId: ID, keys: ["STW.Feeling.title", "STW.Stage.full"]}, ID), {title: false, hints: false});
  assert.deepEqual(touched({moduleId: "x", keys: ["STW.Stage.title"]}, ID), {title: false, hints: false});
  assert.deepEqual(touched({module: ID, keys: null}, ID), {title: true, hints: true});
  assert.deepEqual(Object.keys(GROUPS), ["title", "hints"]);
});
