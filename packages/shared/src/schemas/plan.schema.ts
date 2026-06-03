import { z } from "zod";

export const createPlanSchema = z.object({
  title: z.string().min(3, "Mínimo 3 caracteres").max(100, "Máximo 100 caracteres"),
  description: z.string().max(2000, "Máximo 2000 caracteres").optional(),
  categoryId: z.string().uuid("Categoría inválida"),
  latitude: z.number().min(-90).max(90, "Latitud inválida"),
  longitude: z.number().min(-180).max(180, "Longitud inválida"),
  locationName: z.string().max(200).optional(),
  startsAt: z.string().datetime("Fecha inválida"),
  endsAt: z.string().datetime("Fecha inválida").optional(),
  maxParticipants: z.number().int().min(2, "Mínimo 2 participantes").max(1000).optional(),
  isRecurring: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
});

export const updatePlanSchema = createPlanSchema.partial();

export type CreatePlanInput = z.infer<typeof createPlanSchema>;
export type UpdatePlanInput = z.infer<typeof updatePlanSchema>;
