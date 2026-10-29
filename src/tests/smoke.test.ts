import test from "node:test";
import assert from "node:assert/strict";
import { LuaParser } from "../miz/LuaParser.js";
import { MizSession } from "../miz/MizSession.js";
import { SessionStore } from "../miz/SessionStore.js";
import { createServer, createToolRegistry } from "../server.js";
import { resolveSessionArgs, SESSION_ALIASES, withSessionAliases } from "../tools/session_alias.js";
import { z } from "zod";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
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

test("validate accepts a callsign table (NATO style) and a numeric callsign (Japan, Russia), rejects anything else", async () => {
  const sessions = new SessionStore();
  const session = await MizSession.create("Caucasus");
  sessions.add(session);
  let gid = 900, uid = 900;
  const flight = (name: string, callsign: unknown) => ({
    groupId: ++gid, name, task: "Nothing",
    route: { points: [{ alt: 1000, alt_type: "BARO", type: "Turning Point", action: "Turning Point", x: 0, y: 0, ETA_locked: true }] },
    units: [{ unitId: ++uid, name: `${name} #1`, type: "P-51D", skill: "Excellent", x: 0, y: 0, alt: 1000, payload: {}, callsign }],
  });
  const m = session.mission as any;
  m.coalition.blue.country = [{ id: 4, name: "UK", plane: { group: [flight("TABLE", { 1: 1, 2: 1, 3: 1, name: "Enfield11" })] } }];
  m.coalition.red.country = [{ id: 28, name: "Japan", plane: { group: [
    flight("NUMERIC", 101), flight("ZERO", 0), flight("TEXT", "101"), flight("MISSING", undefined)] } }];
  const validate = missionTools.find((tool) => tool.name === "validate")!;
  const result = await validate.handler({ session_id: session.sessionId }, { sessions });
  const bad = result.errors.filter((e: string) => e.includes("invalid callsign"));
  assert.deepEqual(bad.map((e: string) => e.match(/"([^"]+) #1"/)?.[1]).sort(), ["MISSING", "TEXT", "ZERO"], JSON.stringify(result.errors));
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

test("session aliases: an alias maps onto session_id and the aliases never reach the handler", () => {
  const sessions = new SessionStore();
  const out = resolveSessionArgs({ sessionId: "abc", group_id: 7 }, sessions, true);
  assert.deepEqual(out, { session_id: "abc", group_id: 7 });
  const viaMiz = resolveSessionArgs({ miz_id: "def" }, sessions, true);
  assert.deepEqual(viaMiz, { session_id: "def" });
  const explicitWins = resolveSessionArgs({ session_id: "s1", sessionId: "s2" }, sessions, true);
  assert.equal(explicitWins.session_id, "s1");
});

test("session aliases: missing id uses the only open session, else names the open ones", async () => {
  const sessions = new SessionStore();
  assert.throws(() => resolveSessionArgs({}, sessions, true), /No sessions are open/);
  const a = await MizSession.create("Caucasus");
  sessions.add(a);
  assert.equal(resolveSessionArgs({}, sessions, true).session_id, a.sessionId);
  const b = await MizSession.create("Caucasus");
  sessions.add(b);
  assert.throws(() => resolveSessionArgs({}, sessions, true), /2 sessions are open/);
  // a tool whose session is optional (session_id OR path) is never auto-filled
  assert.equal("session_id" in resolveSessionArgs({ path: "x.miz" }, sessions, false), false);
});

test("session aliases: MCP shape makes session_id optional and adds the aliases only for session tools", () => {
  const withSession = withSessionAliases({ session_id: z.string(), group_id: z.number() });
  assert.equal(withSession.hasSession, true);
  assert.equal(withSession.sessionRequired, true);
  assert.equal(withSession.shape.session_id.isOptional(), true);
  for (const alias of SESSION_ALIASES) assert.ok(alias in withSession.shape, `missing alias ${alias}`);
  const optional = withSessionAliases({ session_id: z.string().optional(), path: z.string().optional() });
  assert.equal(optional.sessionRequired, false);
  const none = withSessionAliases({ theatre: z.string() });
  assert.equal(none.hasSession, false);
  assert.deepEqual(Object.keys(none.shape), ["theatre"]);
});

test("MCP round trip: validate works with session_id dropped (alias, and single-session fallback)", async () => {
  const server = createServer();
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  await server.connect(serverT);
  const client = new Client({ name: "alias-test", version: "0.0.0" });
  await client.connect(clientT);
  const text = (r: any) => JSON.parse(r.content[0].text);
  const created = text(await client.callTool({ name: "new_miz", arguments: { theatre: "Caucasus" } }));
  const viaAlias = await client.callTool({ name: "validate", arguments: { sessionId: created.session_id } });
  assert.notEqual(viaAlias.isError, true, JSON.stringify(viaAlias.content));
  assert.equal(text(viaAlias).valid, true);
  const viaNone = await client.callTool({ name: "validate", arguments: {} });
  assert.notEqual(viaNone.isError, true, JSON.stringify(viaNone.content));
  assert.equal(text(viaNone).valid, true);
  const listed = await client.listTools();
  const v = listed.tools.find((t) => t.name === "validate");
  assert.ok(v && "sessionId" in (v.inputSchema.properties ?? {}), "alias not advertised in the tool schema");
  assert.equal(listed.tools.length, 100);
  await client.close();
  await server.close();
});
