import { randomBytes } from "node:crypto";

/** Swagger UI for the OpenAPI document at /api/v1/openapi.json. */
const SWAGGER_UI_VERSION = "5.17.14";
const CDN = "https://cdn.jsdelivr.net";

const html = (nonce: string) => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>StockBook API docs</title>
  <link rel="stylesheet" href="${CDN}/npm/swagger-ui-dist@${SWAGGER_UI_VERSION}/swagger-ui.css" />
  <style nonce="${nonce}">body { margin: 0; background: #fff; } .topbar { display: none; }</style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script nonce="${nonce}" src="${CDN}/npm/swagger-ui-dist@${SWAGGER_UI_VERSION}/swagger-ui-bundle.js" crossorigin></script>
  <script nonce="${nonce}">
    window.ui = SwaggerUIBundle({
      url: "/api/v1/openapi.json",
      dom_id: "#swagger-ui",
      deepLinking: true,
      persistAuthorization: true,
      withCredentials: true,
      tryItOutEnabled: true,
    });
  </script>
</body>
</html>`;

/** Its own CSP (the middleware skips this path): the Swagger bundle comes from the CDN, inline code is nonced. */
export function GET() {
  const nonce = randomBytes(16).toString("base64");
  return new Response(html(nonce), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": `default-src 'self'; script-src 'nonce-${nonce}'; style-src 'self' ${CDN} 'unsafe-inline'; img-src 'self' data: ${CDN}; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'`,
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "X-Frame-Options": "DENY",
    },
  });
}
