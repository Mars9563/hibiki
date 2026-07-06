'use server';

import { createClient } from '@/lib/supabase/server';
import { ApiResponse } from '@/lib/types';
import { z } from 'zod';

const registerSchema = z.object({
  name: z.string().trim().nonempty('Name is required').max(255),

  username: z
    .string()
    .trim()
    .regex(
      /^[_a-zA-Z][a-zA-Z0-9._]{2,19}$/,
      'Username must start with a letter or underscore and contain only letters, numbers, dots, or underscores (3–20 chars).'
    ),

  email: z.email().transform((v) => v.toLowerCase()),

  password: z
    .string()
    .regex(
      /^(?=.*[a-zA-Z])(?=.*\d).{8,}$/,
      'Password must be at least 8 characters and include at least one letter and one number.'
    ),
});

export async function register(
  formData: FormData
): Promise<ApiResponse<{ userId: string }>> {
  try {
    const validatedFields = registerSchema.safeParse({
      name: formData.get('name') as string,
      username: formData.get('username') as string,
      email: formData.get('email') as string,
      password: formData.get('password') as string,
    });

    if (!validatedFields.success) {
      const errors = z.flattenError(validatedFields.error).fieldErrors;
      return {
        success: false,
        error:
          errors.name?.[0] ||
          errors.username?.[0] ||
          errors.email?.[0] ||
          errors.password?.[0] ||
          'Invalid Data',
      };
    }

    const { name, username, email, password } = validatedFields.data;

    const supabase = await createClient();

    // 🔹 1. Check username
    const { data: existingUsername } = await supabase
      .from('profiles')
      .select('username')
      .eq('username', username)
      .maybeSingle();
    
    console.log(existingUsername);

    if (existingUsername) {
      return {
        success: false,
        error: 'Username already taken.',
      };
    }

    // 🔹 3. Create user (trigger handles profile creation)
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username,
          full_name: name,
        },
      },
    });

    if (error) {
      return {
        success: false,
        error: 'Sign up failed. Please try again.',
      };
    }

    if (!data?.user) {
      return {
        success: false,
        error: 'Sign up failed. Please try again.',
      };
    }

    // 🔥 Detect fake user (duplicate email case)
    if (!data.user.identities || data.user.identities.length === 0) {
      return {
        success: false,
        error: 'An account with this email already exists.',
      };
    }

    return {
      success: true,
      data: {
        userId: data.user.id,
      },
    };

  } catch (error) {
    return {
      success: false,
      error: 'Sign up failed. Please try again.',
    };
  }
}
