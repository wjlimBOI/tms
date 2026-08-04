"use client";

import { useSession } from "next-auth/react";
import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";

export default function ForcePasswordChange() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === "loading") return;
    if (session?.user?.must_change_password && pathname !== "/change-password") {
      router.push("/change-password");
    }
  }, [session, status, pathname, router]);

  return null;
}