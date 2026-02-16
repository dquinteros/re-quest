import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";

export interface AuthenticatedUser {
  id: string;
  login: string;
  name: string | null;
  email: string | null;
  image: string | null;
}

export class UnauthorizedError extends Error {
  readonly status = 401;

  constructor(message = "Authentication required") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export async function requireAuthenticatedUser(): Promise<AuthenticatedUser> {
  const session = await getServerSession(authOptions);
  const sessionUser = session?.user;

  if (!sessionUser?.id || !sessionUser.login) {
    throw new UnauthorizedError();
  }

  return {
    id: sessionUser.id,
    login: sessionUser.login,
    name: sessionUser.name ?? null,
    email: sessionUser.email ?? null,
    image: sessionUser.image ?? null,
  };
}
