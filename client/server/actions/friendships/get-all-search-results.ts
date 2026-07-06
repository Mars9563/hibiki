'use server';

import { ApiResponse } from '@/lib/types';
import axios from 'axios';
import { createClient } from '@/lib/supabase/server';

export type UserData = {
  id: string;
  full_name: string;
  username: string;
  avatar_url: string;
};

export async function searchResult(
  username: string
): Promise<ApiResponse<{ SearchUsers: UserData[] }>> {
  try {
    if (username.length < 2) {
      return {
        success: true,
        data: { SearchUsers: [] },
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

    const response = await axios.get(
      process.env.BACKEND_BASE_URL + '/api/friendships/search?q=' + username,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    

    return {
      success: true,
      data: {
        SearchUsers: response.data.results,
      },
    };
  } catch (error) {
    console.log(error);
    return {
      success: false,
      error: 'Search failed please try again.',
    };
  }
}
