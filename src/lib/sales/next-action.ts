import { z } from "zod";

export const saleNextActionMaxLength = 500;

export const saleNextActionSchema = z.object({
  nextAction: z
    .string()
    .trim()
    .max(
      saleNextActionMaxLength,
      `Keep the next action under ${saleNextActionMaxLength} characters.`,
    )
    .transform((value) => value || null),
  saleId: z.string().trim().min(1, "Sale is required."),
});
