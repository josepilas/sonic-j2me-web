export interface ZoneDefinition {
  id: number;
  name: string;
  assetPrefix: string;
}

export const zones: readonly ZoneDefinition[] = [
  { id: 0, name: "Green Hill", assetPrefix: "zone1" },
  { id: 1, name: "Labyrinth", assetPrefix: "zone3" },
  { id: 2, name: "Scrap Brain", assetPrefix: "zone5" },
];
