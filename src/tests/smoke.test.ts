import test from "node:test";
import assert from "node:assert/strict";
import { LuaParser } from "../miz/LuaParser.js";
import { MizSession } from "../miz/MizSession.js";
import { SessionStore } from "../miz/SessionStore.js";
import { createToolRegistry } from "../server.js";
import { missionTools } from "../tools/mission.js";
import { missionOptionTools } from "../tools/mission_options.js";
import { nearestRoad, sampleGrid, type RoadReference, type TerrainGrid } from "../terrain/TerrainReference.js";

test("Lua parser preserves positional array entries", () => {
  const parsed = LuaParser.parse('test = { "alpha", "bravo", [3] = "charlie" }');
  assert.deepEqual(parsed, ["alpha", "bravo", "charlie"]);
});

test("standalone registry has unique tool names", () => {
  const tools = createToolRegistry().list();
  const names = tools.map((tool) => tool.name);
  assert.equal(names.length, 100, `registry contract is exactly 100 tools; got ${names.length}`);
  assert.equal(new Set(names).size, names.length);
  for (const name of ["open_miz", "new_miz", "save_miz", "list_groups", "get_route", "latlon_to_dcs", "get_mission_options", "list_weapon_settings", "check_spawn_conflicts", "list_templates", "add_template_group", "lint_mission_scripts", "render_mission_overview", "diff_miz", "sample_terrain_height", "validate_terrain_placement", "find_road_near"]) {
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

test("template discovery works on an empty mission without fabricating templates", async () => {
  const sessions = new SessionStore();
  const session = await MizSession.create("Caucasus");
  sessions.add(session);
  const tool = createToolRegistry().get("list_templates");
  assert.ok(tool);
  const result = await tool.handler({ session_id: session.sessionId }, { sessions });
  assert.equal(result.count, 0);
  assert.deepEqual(result.templates, []);
});

test("terrain grid interpolates elevation and estimates slope", () => {
  const grid: TerrainGrid = {
    coordinateSystem: "DCS_METRES",
    origin: { x: 0, y: 0 },
    spacing: { x: 100, y: 100 },
    width: 2,
    height: 2,
    elevations: [[0, 10], [0, 10]],
  };
  const result = sampleGrid(grid, { x: 50, y: 50 });
  assert.equal(result.elevation_m, 5);
  assert.ok(Math.abs(result.slope_degrees - 5.71) < 0.02);
  assert.throws(() => sampleGrid(grid, { x: 300, y: 0 }), /outside/);
});

test("road lookup returns the closest point on a polyline segment", () => {
  const roads: RoadReference = {
    coordinateSystem: "DCS_METRES",
    roads: [{ id: "r1", name: "test road", points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] }],
  };
  const result = nearestRoad(roads, { x: 40, y: 25 });
  assert.ok(result);
  assert.equal(result.road_id, "r1");
  assert.deepEqual(result.nearest_point, { x: 40, y: 0 });
  assert.equal(result.distance_m, 25);
});
