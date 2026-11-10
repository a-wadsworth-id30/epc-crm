import { z } from "zod";

export const optionalFormIdSchema = z.preprocess(
  (value) => (value === null || value === "" ? undefined : value),
  z.string().trim().min(1).optional(),
);
