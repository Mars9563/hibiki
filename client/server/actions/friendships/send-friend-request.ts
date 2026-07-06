'use server';

import { ApiResponse } from '@/lib/types';
import axios from 'axios';
import { createClient } from '@/lib/supabase/server';

export async function sendRequest(
  userId: string
): Promise<ApiResponse<{ message: string }>> {
  try {
    if (!userId) {
      return {
        success: false,
        error: 'Your request did not contain userId.',
      };
    }

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
      process.env.BACKEND_BASE_URL + '/api/friendships/request',
      {
        targetUserId: userId,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.data.success) {
      return {
        success: false,
        error: 'The friend request failed.',
      };
    }

    return {
      success: true,
      data: {
        message: 'Friend request has been successfully.',
      },
    };
  } catch (error) {
    console.error('Error: ', error);
    return {
      success: false,
      error: 'Request send failed.Internal server error.',
    };
  }
}
