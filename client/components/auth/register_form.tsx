'use client';

import { z } from 'zod';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { toast } from 'sonner';

import { register } from '@/server/actions/auth/register';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const registerSchema = z
  .object({
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

    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match!',
    path: ['confirmPassword'],
  });

export function RegisterForm() {
  const router = useRouter();

  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: '',
      username: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
  });

  async function onSubmit(data: z.infer<typeof registerSchema>) {
    setIsLoading(true);

    try {
      const formData = new FormData();

      formData.append('name', data.name);
      formData.append('username', data.username);
      formData.append('email', data.email);
      formData.append('password', data.password);

      const response = await register(formData);

      if (!response.success) {
        toast.error('Sign Up Failed', {
          description: response.error || 'User Sign Up Failed',
        });

        return;
      }

      router.push('/login?verify_email=true');
    } catch (error) {
      console.error(error);

      toast.error('Sign Up Failed', {
        description: 'Please try again later.',
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form
      id="registerForm"
      onSubmit={form.handleSubmit(onSubmit)}
      className="space-y-5"
    >
      {' '}
      <div className="grid gap-5 md:grid-cols-2">
        <Controller
          name="name"
          control={form.control}
          render={({ field, fieldState }) => (
            <div className="space-y-2">
              {' '}
              <label htmlFor="name" className="text-sm font-medium">
                Full Name{' '}
              </label>
              <Input
                {...field}
                id="name"
                placeholder="John Doe"
                autoComplete="name"
                className="h-11"
              />
              {fieldState.error && (
                <p className="text-sm text-destructive">
                  {fieldState.error.message}
                </p>
              )}
            </div>
          )}
        />

        <Controller
          name="username"
          control={form.control}
          render={({ field, fieldState }) => (
            <div className="space-y-2">
              <label htmlFor="username" className="text-sm font-medium">
                Username
              </label>

              <Input
                {...field}
                id="username"
                placeholder="kaze"
                autoComplete="username"
                className="h-11"
              />

              {fieldState.error && (
                <p className="text-sm text-destructive">
                  {fieldState.error.message}
                </p>
              )}
            </div>
          )}
        />
      </div>
      <Controller
        name="email"
        control={form.control}
        render={({ field, fieldState }) => (
          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium">
              Email
            </label>

            <Input
              {...field}
              id="email"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              className="h-11"
            />

            {fieldState.error && (
              <p className="text-sm text-destructive">
                {fieldState.error.message}
              </p>
            )}
          </div>
        )}
      />
      <div className="grid gap-5 md:grid-cols-2">
        <Controller
          name="password"
          control={form.control}
          render={({ field, fieldState }) => (
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium">
                Password
              </label>

              <Input
                {...field}
                id="password"
                type="password"
                placeholder="••••••••"
                autoComplete="new-password"
                className="h-11"
              />

              {fieldState.error && (
                <p className="text-sm text-destructive">
                  {fieldState.error.message}
                </p>
              )}
            </div>
          )}
        />

        <Controller
          name="confirmPassword"
          control={form.control}
          render={({ field, fieldState }) => (
            <div className="space-y-2">
              <label htmlFor="confirmPassword" className="text-sm font-medium">
                Confirm Password
              </label>

              <Input
                {...field}
                id="confirmPassword"
                type="password"
                placeholder="••••••••"
                autoComplete="new-password"
                className="h-11"
              />

              {fieldState.error && (
                <p className="text-sm text-destructive">
                  {fieldState.error.message}
                </p>
              )}
            </div>
          )}
        />
      </div>
      <Button
        type="submit"
        disabled={isLoading}
        className="h-11 w-full bg-primary text-primary-foreground hover:bg-primary/90"
      >
        {isLoading ? 'Creating Account...' : 'Create Account'}
      </Button>
    </form>
  );
}
