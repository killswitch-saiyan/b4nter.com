export interface User {
  id: string;
  username: string;
  email: string;
  full_name?: string;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
}

export interface Channel {
  id: string;
  name: string;
  description?: string;
  is_private: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  member_count: number;
}

export interface Message {
  id: string;
  content: string;
  sender_id: string;
  sender_name: string;
  channel_id?: string;
  recipient_id?: string;
  created_at: string;
  updated_at: string;
}

export interface ChannelMember {
  user_id: string;
  channel_id: string;
  role: 'user' | 'admin';
  joined_at: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  username: string;
  email: string;
  password: string;
  full_name?: string;
}

export interface CreateChannelData {
  name: string;
  description?: string;
  is_private?: boolean;
}

export interface CreateMessageData {
  content: string;
  channel_id?: string;
  recipient_id?: string;
}

export interface SocketEvent {
  event: string;
  data: any;
} 