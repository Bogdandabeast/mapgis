import { z } from "zod";

export const updateProfileSchema = z.object({
  displayName: z.string().min(2, "Mínimo 2 caracteres").max(50, "Máximo 50 caracteres"),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
