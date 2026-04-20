export { auth as middleware } from "./auth";

export const config = {
  matcher: ["/chat/:path*", "/integrations", "/memory", "/settings"]
};
