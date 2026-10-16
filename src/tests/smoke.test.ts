import test from "node:test";
import assert from "node:assert/strict";
import { LuaParser } from "../miz/LuaParser.js";
import { MizSession } from "../miz/MizSession.js";
import { SessionStore } from "../miz/SessionStore.js";
import { createToolRegistry } from "../server.js";
import { missionTools } from "../tools/mission.js";
import { missionOptionTools } from "../tools/mission_options.js";

test("Lua parser preserves positional array entries", () => {
  const parsed = LuaParser.parse('test = { "alpha", "bravo", [3] = "charlie" }');
  assert.deepEqual(parsed, ["alpha", "bravo", "charlie"]);
});

test("standalone registry has unique tool names", () => {
  const tools = createToolRegistry().list();
  const names = tools.map((tool) => tool.name);
  assert.ok(names.length >= 15, `expected migrated core tools, got ${names.length}`);
  assert.equal(new Set(names).size, names.length);
  for (const name of ["open_miz", "new_miz", "save_miz", "list_groups", "get_route", "latlon_to_dcs"]) {
    assert.ok(names.includes(name), `missing ${name}`);
  }
});

test("new mission skeleton passes core DCS invariant validation", async () => {
  const sessions = new SessionStore();
  const session = await MizSession.create("Caucasus");
  sessions.add(session);
  const validate = missionTools.find((tool) => tool.name === "validate");
  assert.ok(validate);
  const result = await validate.handler({ session_id: session.sessionId }, { sessions });
  assert.equal(result.valid, true, JSON.stringify(result.errors));
});

test("mission options tools safely read and update nested values", async () => {
  const sessions = new SessionStore();
  const session = await MizSession.create("Caucasus");
  sessions.add(session);
  const setOption = missionOptionTools.find((tool) => tool.name === "set_mission_option");
  const getOption = missionOptionTools.find((tool) => tool.name === "get_mission_option");
  assert.ok(setOption);
  assert.ok(getOption);
  await setOption.handler(
    { session_id: session.sessionId, path: "difficulty.label", value: true },
    { sessions },
  );
  const result = await getOption.handler(
    { session_id: session.sessionId, path: "difficulty.label" },
    { sessions },
  );
  assert.equal(result.value, true);
  assert.equal(session.isDirty, true);
  await assert.rejects(
    () => setOption.handler(
      { session_id: session.sessionId, path: "__proto__.polluted", value: true },
      { sessions },
    ),
    /Invalid mission option path|Invalid option path/,
  );
});
