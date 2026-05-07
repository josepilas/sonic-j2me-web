export interface ZoneDefinition {
  id: number;
  name: string;
  assetPrefix: string;
  actFile: string;
  mapLayerFile: string;
  mapDataFile: string;
}

export const zones: readonly ZoneDefinition[] = [
  { id: 0, name: "Green Hill", assetPrefix: "zone1", actFile: "ZONE1ACT.act", mapLayerFile: "MapLzone1.blt", mapDataFile: "mc_zone1_map_data.bin" },
  { id: 1, name: "Labyrinth", assetPrefix: "zone2", actFile: "ZONE2ACT.act", mapLayerFile: "MapLzone2.blt", mapDataFile: "mc_zone2_map_data.bin" },
  { id: 2, name: "Marble", assetPrefix: "zone3", actFile: "ZONE3ACT.act", mapLayerFile: "MapLzone3.blt", mapDataFile: "mc_zone3_map_data.bin" },
  { id: 3, name: "Star Light", assetPrefix: "zone4", actFile: "ZONE4ACT.act", mapLayerFile: "MapLzone4.blt", mapDataFile: "mc_zone4_map_data.bin" },
  { id: 4, name: "Spring Yard", assetPrefix: "zone5", actFile: "ZONE5ACT.act", mapLayerFile: "MapLzone5.blt", mapDataFile: "mc_zone5_map_data.bin" },
  { id: 5, name: "Scrap Brain", assetPrefix: "zone6", actFile: "ZONE6ACT.act", mapLayerFile: "MapLzone6.blt", mapDataFile: "mc_zone6_map_data.bin" },
];

export function getZoneDefinition(zoneID: number): ZoneDefinition {
  return zones.find((zone) => zone.id === zoneID) ?? zones[0];
}
