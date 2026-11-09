import { z } from "zod";

export const id30AuthIdentifierSchema = z
  .string()
  .trim()
  .min(1, "Enter the exact iD30 Auth ID.")
  .max(160, "iD30 Auth IDs must be 160 characters or fewer.")
  .refine((value) => !value.includes("*"), {
    message: "Use the exact ID from iD30 Auth. Wildcards are not valid.",
  });
