export const spruceBuiltForms = [
  "detached",
  "semi_detached",
  "mid_terrace",
  "end_terrace",
] as const;

export const sprucePropertyTypes = ["house", "flat", "bungalow"] as const;

export const spruceFuelTypes = [
  "mains_gas",
  "oil",
  "lpg",
  "electric",
  "coal",
  "wood",
] as const;

export const spruceLoftInsulationValues = [
  "none",
  "50mm",
  "100mm",
  "150mm",
  "200mm",
  "250+mm",
] as const;

export const spruceWallTypes = [
  "cavity_wall_filled",
  "cavity_wall_unfilled",
  "solid_brick_uninsulated",
  "solid_brick_internal_insulation",
  "solid_brick_external_insulation",
  "solid_brick_unknown",
  "solid_stone_uninsulated",
  "solid_stone_internal_insulation",
  "solid_stone_external_insulation",
  "solid_stone_unknown",
  "solid_concrete_uninsulated",
  "solid_concrete_internal_insulation",
  "solid_concrete_external_insulation",
  "solid_concrete_unknown",
  "timber_uninsulated",
  "timber_internal_insulation",
  "timber_external_insulation",
  "timber_unknown",
] as const;

export const spruceWindowTypes = [
  "single_glazing",
  "double_glazing",
  "high_performance",
  "triple_glazing",
] as const;

export type SpruceBuiltForm = (typeof spruceBuiltForms)[number];
export type SpruceFuelType = (typeof spruceFuelTypes)[number];
export type SpruceLoftInsulation = (typeof spruceLoftInsulationValues)[number];
export type SprucePropertyType = (typeof sprucePropertyTypes)[number];
export type SpruceWallType = (typeof spruceWallTypes)[number];
export type SpruceWindowType = (typeof spruceWindowTypes)[number];

export const spruceJobFieldOptions = {
  builtForm: [
    { label: "Detached", value: "detached" },
    { label: "Semi-detached", value: "semi_detached" },
    { label: "Mid terrace", value: "mid_terrace" },
    { label: "End terrace", value: "end_terrace" },
  ],
  fuelType: [
    { label: "Mains gas", value: "mains_gas" },
    { label: "Oil", value: "oil" },
    { label: "LPG", value: "lpg" },
    { label: "Electric", value: "electric" },
    { label: "Coal", value: "coal" },
    { label: "Wood", value: "wood" },
  ],
  loftInsulation: [
    { label: "None", value: "none" },
    { label: "50mm", value: "50mm" },
    { label: "100mm", value: "100mm" },
    { label: "150mm", value: "150mm" },
    { label: "200mm", value: "200mm" },
    { label: "250+mm", value: "250+mm" },
  ],
  propertyType: [
    { label: "House", value: "house" },
    { label: "Flat", value: "flat" },
    { label: "Bungalow", value: "bungalow" },
  ],
  wallType: [
    { label: "Cavity wall, filled", value: "cavity_wall_filled" },
    { label: "Cavity wall, unfilled", value: "cavity_wall_unfilled" },
    { label: "Solid brick, uninsulated", value: "solid_brick_uninsulated" },
    {
      label: "Solid brick, internal insulation",
      value: "solid_brick_internal_insulation",
    },
    {
      label: "Solid brick, external insulation",
      value: "solid_brick_external_insulation",
    },
    { label: "Solid brick, unknown", value: "solid_brick_unknown" },
    { label: "Solid stone, uninsulated", value: "solid_stone_uninsulated" },
    {
      label: "Solid stone, internal insulation",
      value: "solid_stone_internal_insulation",
    },
    {
      label: "Solid stone, external insulation",
      value: "solid_stone_external_insulation",
    },
    { label: "Solid stone, unknown", value: "solid_stone_unknown" },
    {
      label: "Solid concrete, uninsulated",
      value: "solid_concrete_uninsulated",
    },
    {
      label: "Solid concrete, internal insulation",
      value: "solid_concrete_internal_insulation",
    },
    {
      label: "Solid concrete, external insulation",
      value: "solid_concrete_external_insulation",
    },
    { label: "Solid concrete, unknown", value: "solid_concrete_unknown" },
    { label: "Timber, uninsulated", value: "timber_uninsulated" },
    {
      label: "Timber, internal insulation",
      value: "timber_internal_insulation",
    },
    {
      label: "Timber, external insulation",
      value: "timber_external_insulation",
    },
    { label: "Timber, unknown", value: "timber_unknown" },
  ],
  windowType: [
    { label: "Single glazing", value: "single_glazing" },
    { label: "Double glazing", value: "double_glazing" },
    { label: "High performance", value: "high_performance" },
    { label: "Triple glazing", value: "triple_glazing" },
  ],
} as const;
