import { z } from "zod";

export const registerSchema = z.object({
  email: z.email().toLowerCase(),
  password: z.string().min(8).max(128),
  nickname: z.string().min(2).max(60),
  role: z.enum(["STUDENT", "TEACHER", "GUEST"]).default("STUDENT"),
});

export const loginSchema = z.object({
  email: z.email().toLowerCase(),
  password: z.string().min(8).max(128),
});
