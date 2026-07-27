import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Route/role gating (specs/0000-foundation/route-architecture.md).
 * /app/* requires a session + has_role('staff' | 'admin'). A user without
 * the matching role is redirected, not shown a 403 — avoids leaking route
 * existence. /landlord/* and /vendor/* follow the same pattern once those
 * products land (Weeks 5-6); only /app/* exists in Product 1.
 */
export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isStaffRoute = pathname.startsWith("/app") && pathname !== "/app/login";

  if (isStaffRoute && !user) {
    const loginUrl = new URL("/app/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isStaffRoute && user) {
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .in("role", ["staff", "admin"]);

    if (!roles || roles.length === 0) {
      return NextResponse.redirect(new URL("/app/login", request.url));
    }
  }

  return response;
}

export const config = {
  matcher: ["/app/:path*"],
};
