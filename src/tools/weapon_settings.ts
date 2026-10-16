import { z } from "zod";
import type { ToolDefinition } from "./index.js";
import { asArray } from "../miz/MizSession.js";

/**
 * Mission-side weapon settings discovery. This reports CLSIDs already present
 * in the mission; it does not pretend to enumerate every weapon supported by
 * every installed DCS module.
 */
export const weaponSettingsTools: ToolDefinition[] = [
  {
    name: "list_weapon_settings",
    description: "Inspect configured aircraft weapon/pylon settings in an open mission. Reports unit identity, aircraft type, pylon station, CLSID, fuel, countermeasures and gun ammunition where present. This inventories the mission's current loadouts; it is not a global DCS weapon database.",
    inputSchema: z.object({
      session_id: z.string(),
      unit_id: z.number().optional(),
      group_id: z.number().optional(),
      group_name: z.string().optional(),
    }),
    async handler(args: { session_id: string; unit_id?: number; group_id?: number; group_name?: string }, ctx) {
      const session = ctx.sessions.get(args.session_id);
      if (args.unit_id != null) {
        const found = session.findUnitById(args.unit_id);
        if (!found) throw new Error(`No unit with id ${args.unit_id}`);
        return { count: 1, units: [summarize(found.unit, found.group.groupId, found.group.name)] };
      }
      if (args.group_id != null || args.group_name) {
        const found = args.group_id != null
          ? session.findGroupById(args.group_id)
          : session.findGroupByName(args.group_name!);
        if (!found) throw new Error("No matching group found");
        return {
          group_id: found.group.groupId,
          group_name: found.group.name,
          count: asArray<any>(found.group.units as any).length,
          units: asArray<any>(found.group.units as any).map((unit: any) =>
            summarize(unit, found.group.groupId, found.group.name)),
        };
      }
      const units: any[] = [];
      for (const entry of session.iterGroups()) {
        for (const unit of asArray<any>(entry.group.units as any)) {
          if (unit.payload || entry.category === "plane" || entry.category === "helicopter") {
            units.push(summarize(unit, entry.group.groupId, entry.group.name));
          }
        }
      }
      return { count: units.length, units };
    },
  },
];

function summarize(unit: any, groupId: number, groupName: string) {
  const payload = unit.payload ?? {};
  const pylons = payload.pylons && typeof payload.pylons === "object"
    ? Object.entries(payload.pylons).map(([station, setting]: [string, any]) => ({
        station: Number.isFinite(Number(station)) ? Number(station) : station,
        clsid: setting?.CLSID ?? null,
        setting,
      })).sort((a, b) => Number(a.station) - Number(b.station))
    : [];
  return {
    unit_id: unit.unitId,
    unit_name: unit.name,
    aircraft_type: unit.type,
    group_id: groupId,
    group_name: groupName,
    pylons,
    fuel_kg: payload.fuel ?? null,
    flare: payload.flare ?? null,
    chaff: payload.chaff ?? null,
    gun_ammunition: payload.gun ?? null,
    payload_present: unit.payload != null,
  };
}
