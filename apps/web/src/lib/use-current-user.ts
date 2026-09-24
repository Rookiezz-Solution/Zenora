"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "./api";

interface CurrentUser {
  id: string;
}

export function useCurrentUser() {
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<CurrentUser>("/auth/me")
      .then((u) => setUserId(u.id))
      .catch(() => setUserId(null));
  }, []);

  return { userId };
}
