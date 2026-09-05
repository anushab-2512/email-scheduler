export interface User {
  id: string;
  google_id: string;
  name: string;
  email: string;
  avatar_url: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface GoogleUserInfo {
  sub: string;
  name: string;
  email: string;
  picture?: string;
}

export interface JwtPayload {
  userId: string;
  email: string;
}
