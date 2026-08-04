import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: number;
      role_id: number;
      must_change_password?: boolean;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
  interface User {
    id: number;
    role_id: number;
    must_change_password?: boolean;
  }
}