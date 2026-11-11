/** @type {import('next').NextConfig} */
const nextConfig = {
  // Pages depend on the user's session cookie, so render at request time.
  turbopack: { root: import.meta.dirname },
  output: "standalone",
  poweredByHeader: false,
  async headers() {
    const development = process.env.NODE_ENV !== "production";
    const policy = (connect) => [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${development ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      `connect-src 'self'${connect}`,
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "upgrade-insecure-requests",
    ].join("; ");
    const csp = policy("");
    // Video call pages, and only those, may use the camera and microphone and reach Twilio.
    const callHeaders = [
      { key: "Content-Security-Policy", value: policy(" https://*.twilio.com wss://*.twilio.com") },
      { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(), payment=()" },
    ];
    return [{
      source: "/:path*",
      headers: [
        { key: "Content-Security-Policy", value: csp },
        { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        ...(development ? [] : [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]),
      ],
    },
    // Later entries override earlier ones for the same header.
    { source: "/portal/appointments/:id/call", headers: callHeaders },
    { source: "/admin/appointments/:id/call", headers: callHeaders }];
  },
};

export default nextConfig;
