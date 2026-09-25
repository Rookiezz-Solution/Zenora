import { z } from "zod";

export const createTaskSchema = z.object({
  title: z.string().min(1),
  leadId: z.string().optional(),
  assignedToId: z.string().optional(),
  dueAt: z.string().datetime().optional()
});
export type CreateTaskDto = z.infer<typeof createTaskSchema>;

export const updateTaskSchema = z.object({
  title: z.string().min(1).optional(),
  assignedToId: z.string().nullable().optional(),
  dueAt: z.string().datetime().nullable().optional(),
  completed: z.boolean().optional()
});
export type UpdateTaskDto = z.infer<typeof updateTaskSchema>;

export const listTasksQuerySchema = z.object({
  assignedToId: z.string().optional(),
  leadId: z.string().optional(),
  completed: z.enum(["true", "false"]).optional()
});
export type ListTasksQuery = z.infer<typeof listTasksQuerySchema>;
