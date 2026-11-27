# ts-partner

Client for the partner's order API. Node runs the TypeScript directly (no build step); `npm test`
runs `node --test`. There are no runtime dependencies.

Production uses a public certificate. The partner's staging API uses a certificate signed by the
partner's own CA; that CA's certificate is in `certs/partner-ca.pem`.
