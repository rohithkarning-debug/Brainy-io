// Sends signed-out visitors on a protected page to /login (see authorized() in auth.ts).
// /api/expand checks the session itself, so it isn't matched here.
export { auth as middleware } from "@/auth";

// The pages that need a signed-in user. Node runtime: Auth.js's JWT library
// pulls in APIs the Edge runtime warns about.
export const config = {
  runtime: "nodejs",
  matcher: ["/ask", "/result/:path*", "/history", "/saved", "/settings"],
};
