# Stage: Scan

## Input

- Optional focus area (e.g., `pii`, `access`, `deps`). Default: full 12-point audit.

## Process

Launch specialist agents in batches of 4:

### Batch 1
1. **Asset Inventory & Threat Modeling** — identify all systems, data stores, external services. STRIDE threat model. Check: AssemblyAI, Bedrock, Clerk, Ably, Mixpanel, Expo, Twilio, Postgres, S3, Render, Vercel, EAS, EC2.
2. **Access Control & Identity** — Clerk auth, RBAC, service-to-service auth (`X-Internal-Secret`), API key rotation, MFA, impersonation controls, secrets in code, env var handling.
3. **Data Security & PII** (HIGHEST PRIORITY) — AssemblyAI data handling, Bedrock data handling (confirm no training), Clerk DPA, Mixpanel PII, S3 encryption, DB PII fields, deletion capability. Flag ANY model-training risk as CRITICAL.
4. **Network & Application Security** — TLS, CORS, input validation, OWASP Top 10, rate limiting, CSP headers, secrets management.

### Batch 2
5. **Vulnerability & Dependencies** — `npm audit`, outdated packages, third-party security, supply chain risks.
6. **Logging & Monitoring** — Sentry coverage, audit trails, PII in logs, incident response, alerting.
7. **Compliance & Documentation** — DPAs with vendors, privacy policy, data retention, deletion capability (GDPR/CCPA).

## Output

Raw findings from each agent, ready for compilation in Stage 2.

## Completion

Proceed to `stages/2-report/` with all agent findings.
