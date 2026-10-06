import { z } from 'zod';

export const email = z.string().trim().toLowerCase().max(255).pipe(z.email());

export const registerSchema = z.object({

    email,
    password : z.string().min(8).max(128),
    name : z.string().trim().min(1).max(100),
});

export const loginSchema = z.object({
    email,
    password: z.string().min(1).max(128),
});

export const refreshSchema = z.object({
    refreshToken : z.string().min(1)
});