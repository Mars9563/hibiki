'use server';
import { createClient } from '@/lib/supabase/server';
import { ApiResponse } from '@/lib/types';
import axios from 'axios';

export async function acceptRequest(
  userId: string
): Promise<ApiResponse<{ userId: string }>> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();

    if (error || !data.user) {
      return {
        success: false,
        error: 'Unauthorized',
      };
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    if (!token) {
      return {
        success: false,
        error: 'Unauthorized',
      };
    }

    const response = await axios.post(
      process.env.BACKEND_BASE_URL + '/api/friendships/accept',
      {
        targetId: userId,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (response.data && !response.data.success) {
      return {
        success: false,
        error: response.data.error || 'Internal server error.',
      };
    }

    return {
      success: true,
      data: {
        userId: userId,
      },
    };
  } catch (error) {
    return {
      success: false,
      error:
        'There was an error while accepting request. Please try agian later.',
    };
  }
}
