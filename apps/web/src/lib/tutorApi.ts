import { getToken } from '@/lib/auth-token';
import { API_BASE_URL } from './api';

export interface TutorDTO {
  id: string;
  user_id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  whatsapp?: boolean | null;
  postal_code?: string | null;
  street?: string | null;
  number?: string | null;
  complement?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface TutorCreateDTO {
  name: string;
  phone?: string;
  email?: string;
  whatsapp?: boolean;
  postal_code?: string;
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  country?: string;
}

export type TutorUpdateDTO = Partial<TutorCreateDTO>;

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.detail || 'Failed to process request');
  }
  return response.json() as Promise<T>;
}

function getAuthHeaders(): HeadersInit {
  const token = getToken();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

export async function createTutor(payload: TutorCreateDTO): Promise<TutorDTO> {
  const response = await fetch(`${API_BASE_URL}/tutors/me`, {
    method: 'POST',
    headers: getAuthHeaders(),
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  return handleResponse<TutorDTO>(response);
}

export async function getTutor(): Promise<TutorDTO> {
  const token = getToken();
  const headers: HeadersInit = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  const response = await fetch(`${API_BASE_URL}/tutors/me`, {
    credentials: 'include',
    headers,
  });
  return handleResponse<TutorDTO>(response);
}

export async function updateTutor(payload: TutorUpdateDTO): Promise<TutorDTO> {
  const response = await fetch(`${API_BASE_URL}/tutors/me`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  return handleResponse<TutorDTO>(response);
}