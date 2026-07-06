'use server';

import { createClient } from '@/lib/supabase/server';
import { ApiResponse } from '@/lib/types';
import axios from 'axios';
export type pendingRequests = {
  id: string;
  status: string;
  created_at: Date;
  requester_id: string;
  addressee_id: string;

  requester: {
    id: string;
    username: string;
    full_name: string;
    avatar_url: string;
  };

  addressee: {
    id: string;
    username: string;
    full_name: string;
    avatar_url: string;
  };
};
export type sentPending = {
  type: string;
  id: string;
  status: string;
  created_at: Date;
  requester_id: string;
  addressee_id: string;

  addressee: {
    id: string;
    username: string;
    full_name: string;
    avatar_url: string;
  };
};
export type recievedPending = {
  type: string;
  id: string;
  status: string;
  created_at: Date;
  requester_id: string;
  addressee_id: string;

  requester: {
    id: string;
    username: string;
    full_name: string;
    avatar_url: string;
  };
};

export async function pendingUserRequests(): Promise<
  ApiResponse<{
    sentPending: sentPending[];
    recievedPending: recievedPending[];
  }>
> {
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
    const userId = data.user.id;
    if (!token) {
      return {
        success: false,
        error: 'Unauthorized',
      };
    }

    const response = await axios.get(
      process.env.BACKEND_BASE_URL + '/api/friendships/pending',
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    let pendingRequests = [];
    if (response.data.success && response.data.pending) {
      pendingRequests = response.data.pending;
    }

    let sentRequestsRefined: sentPending[] = pendingRequests
      .filter((request: pendingRequests) => request.requester_id === userId)
      .map((request: pendingRequests) => ({
        type: 'sent',
        id: request.id,
        status: request.status,
        created_at: request.created_at,
        requester_id: request.requester_id,
        addressee_id: request.addressee_id,
        addressee: request.addressee,
      }));
    let recievedRequestsRefined: recievedPending[] = pendingRequests
      .filter((request: pendingRequests) => request.addressee_id === userId)
      .map((request: pendingRequests) => ({
        type: 'recieved',
        id: request.id,
        status: request.status,
        created_at: request.created_at,
        requester_id: request.requester_id,
        addressee_id: request.addressee_id,
        requester: request.requester,
      }));

    return {
      success: true,
      data: {
        sentPending: sentRequestsRefined,
        recievedPending: recievedRequestsRefined,
      },
    };
  } catch (error) {
    console.error(error);
    return {
      success: false,
      error: 'There was an internal server error. Please try again.',
    };
  }
}
