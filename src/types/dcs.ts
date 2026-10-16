export interface LatLon {
  lat: number;
  lon: number;
}

export interface XY {
  x: number;
  y: number;
}

export type Position =
  | { lat_lon: LatLon }
  | { xy: XY };

export type Coalition = 'blue' | 'red' | 'neutral';
export type UnitCategory = 'plane' | 'helicopter' | 'vehicle' | 'ship' | 'static';

export interface DcsMission {
  [key: string]: any;
  trig?: any;
  trigrules?: any;
  result?: any;
  groundControl?: any;
  goals?: any;
  weather?: any;
  theatre?: string;
  sortie?: string;
  descriptionText?: string;
  descriptionNeutralsTask?: string;
  descriptionBlueTask?: string;
  descriptionRedTask?: string;
  date?: { Year: number; Month: number; Day: number };
  start_time?: number;
  version?: number;
  maxKey?: number;
  coalitions?: Record<string, number[] | Record<string, number>>;
  coalition?: {
    blue?: CoalitionData;
    red?: CoalitionData;
    neutrals?: CoalitionData;
  };
  forcedOptions?: Record<string, any>;
  failures?: any;
  currentKey?: number;
  maxDictId?: number;
  triggers?: any;
  requiredModules?: Record<string, string>;
}

export interface CoalitionData {
  name: string;
  country?: CountryData[];
}

export interface CountryData {
  id: number;
  name: string;
  plane?: { group: GroupData[] };
  helicopter?: { group: GroupData[] };
  vehicle?: { group: GroupData[] };
  ship?: { group: GroupData[] };
  static?: { group: GroupData[] };
}

export interface GroupData {
  groupId: number;
  name: string;
  hidden?: boolean;
  lateActivation?: boolean;
  start_time?: number;
  task?: string;
  uncontrolled?: boolean;
  route?: RouteData;
  units?: UnitData[];
  x?: number;
  y?: number;
  [key: string]: any;
}

export interface UnitData {
  unitId: number;
  name: string;
  type: string;
  skill?: string;
  x: number;
  y: number;
  heading?: number;
  speed?: number;
  alt?: number;
  alt_type?: string;
  payload?: PayloadData;
  callsign?: any;
  onboard_num?: string;
  livery_id?: string;
  [key: string]: any;
}

export interface RouteData {
  routeRelativeTOT?: boolean;
  points?: WaypointData[];
  [key: string]: any;
}

export interface WaypointData {
  name?: string;
  type?: string;
  action?: string;
  alt?: number;
  alt_type?: string;
  speed?: number;
  x: number;
  y: number;
  task?: any;
  [key: string]: any;
}

export interface PayloadData {
  pylons?: Record<number, { CLSID: string }>;
  fuel?: number;
  flare?: number;
  chaff?: number;
  gun?: number;
  [key: string]: any;
}

export interface WeatherData {
  atmosphere_type?: number;
  wind?: any;
  enable_fog?: boolean;
  fog?: { thickness: number; visibility: number };
  visibility?: { distance: number };
  clouds?: any;
  season?: { temperature: number };
  [key: string]: any;
}

export interface TriggerData {
  actions?: any[];
  conditions?: any[];
  flag?: number;
  rules?: any[];
  [key: string]: any;
}

export interface ZoneData {
  name: string;
  x: number;
  y: number;
  radius?: number;
  type?: number;
  color?: number[];
  properties?: Record<string, any>;
  hidden?: boolean;
  [key: string]: any;
}
