import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string().email('Valid email required'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})

export const signupSchema = z.object({
  email: z.string().email('Valid email required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username must be less than 30 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'),
  full_name: z.string().min(2, 'Full name required').max(50),
})

export const editProfileSchema = z.object({
  full_name: z.string().min(2).max(50).optional(),
  bio: z.string().max(150, 'Bio must be less than 150 characters').optional(),
  username: z
    .string()
    .min(3)
    .max(30)
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores')
    .optional(),
})

export const postSchema = z.object({
  content: z.string().max(2200, 'Caption must be less than 2200 characters').optional(),
  media_type: z.enum(['image', 'video', 'none']).default('none'),
})

export const commentSchema = z.object({
  content: z.string().min(1, 'Comment cannot be empty').max(500, 'Comment too long'),
})

export type LoginSchema = z.infer<typeof loginSchema>
export type SignupSchema = z.infer<typeof signupSchema>
export type EditProfileSchema = z.infer<typeof editProfileSchema>
export type PostSchema = z.infer<typeof postSchema>
export type CommentSchema = z.infer<typeof commentSchema>
