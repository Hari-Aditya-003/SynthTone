# Voice Identity, Consent and Production Security

## Threat model

A voice generator can be misused to impersonate people or circumvent expectations of authenticity. Reference audio is biometric-like sensitive personal data, and inference GPU access can be exploited for denial of service. This starter is suitable for **personal private prototyping only**; the upload checkbox is an explicit attestation, **not** an identity/consent proof mechanism.

## Rights and consent

- Require affirmatively verified speaker authorization for each new voice profile in production; attach scope of allowed use and timestamp.
- Do not allow cloning arbitrary public figures, strangers, minors or other voices without adequate legal rights and consent.
- Maintain speaker-contact and revocation path. Deleting a voice must invalidate all cached embeddings and queued jobs that use it; apply retention policy to generated derivatives.
- Label synthesized audio and preserve watermarking/provenance where available. Chatterbox upstream describes built-in PerTh watermarking; preserve original output and verify behavior after transcoding.
- No public reference-voice marketplace unless licensing, privacy, consent and moderation are independently addressed.
- Provide disclosure guidance for listeners and an abuse reporting channel.

## Security controls

| Control | Alpha | Production requirement |
|---|---|---|
| Browser to server | Local loopback / SSH tunnel / Tailscale Serve | HTTPS and network segregation |
| API credential | One `X-API-Key` | User accounts, scoped rotating API keys, CSRF/XSS defenses |
| Data isolation | Single-user file directory | Per-tenant RBAC, at-rest encryption, signed URLs |
| Upload duration/size | Limit and FFmpeg conversion | Media sandbox, malware scanning, strict MIME checks, resource limits |
| Job consumption | Serial queue | Quotas, rate limits, priority, safe cancellation, retry policies |
| Voice consent | Checkbox attestation | Verified audio or documented authorization, audit and revocation |
| Logs | FastAPI logs | Secrets and private voice/text redaction |
| Model safety | Known upstream engines | Signed/pinned model revisions, dependency/image scanning |
| Data deletion | Delete reference file | DB/object deletion, derived embedding purge, retention requests |

## Known alpha gaps

- The app has no separate users or tenant isolation.
- Raw API key is held only in the browser session memory while the page is open; do not add it to URLs or persist it in localStorage.
- Browser audio downloads fetch authenticated audio blobs. Object URLs are temporary; for sensitive cases revoke them on page change.
- Audio sanitization uses installed FFmpeg, which still needs timely patching and sandboxing.
- No ASR, voice identity verification, reliable watermark audit, privacy policy, abuse rate limiting or password reset.
- Text and speaker identity remain in SQLite and `data/`; backups must be private.
- The worker is a thread inside the API process; use separate OS-level isolation, job privileges and quotas before inviting strangers.

## Responsible release gate

A public release is not safe based solely on a responsive UI and an MIT license. Require user isolation, explicit authorized voice records, revocation path, security threat-model review, logs redaction and disaster recovery rehearsal before promoting to a production public endpoint.
