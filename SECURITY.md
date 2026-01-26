# Security Considerations

## Authentication & Credential Storage

### Current Implementation

Navidrome Jam uses **localStorage** to persist authentication credentials (username, token, salt) for session management. This enables users to remain logged in across browser sessions without re-entering credentials.

### Known Security Risks

**localStorage is vulnerable to XSS (Cross-Site Scripting) attacks.** If an attacker can inject malicious JavaScript into the application, they could:
- Steal authentication tokens from localStorage
- Use stolen credentials to access the user's Navidrome instance

### Why This Trade-Off Is Acceptable

1. **Personal Music Server Context**
   - Users authenticate with their own Navidrome instance, not a shared service
   - The attack surface is limited to users who expose their Navidrome instance publicly
   - Most users run Navidrome on their local network or behind VPN

2. **Risk Profile**
   - This is a music streaming application, not a financial or sensitive data application
   - The worst-case impact is unauthorized access to music playback, not data theft or financial loss

3. **Alternative Complexity**
   - Using httpOnly cookies would require:
     - A backend proxy server between client and Navidrome
     - Server-side session management infrastructure
     - Significant architectural complexity for minimal security gain

4. **Mitigation Strategy**
   - Credentials are **validated on restore** via Navidrome ping to detect tampering/expiry
   - Invalid or tampered credentials are immediately cleared from storage
   - Users are encouraged to use HTTPS for their Navidrome instance

### Recommendations for Users

1. **Use HTTPS** - Always access your Navidrome instance over HTTPS to prevent token interception
2. **Keep Software Updated** - Update Navidrome Jam and your browser regularly to patch XSS vulnerabilities
3. **Trusted Networks Only** - Only use Navidrome Jam on trusted devices and networks
4. **Private Instances** - Consider keeping your Navidrome instance private (local network/VPN only)

## Server Security

The sync server implements several security measures:

### Input Validation
- Room IDs are validated (alphanumeric, max 6 characters)
- User names are sanitized to prevent XSS injection
- All REST endpoints use try-catch error handling

### Rate Limiting
- Room creation is limited to 5 requests per IP per minute
- Prevents spam and DoS attacks on room creation endpoint

### Authorization
- Only room hosts can send playback commands (play, pause, seek)
- Server validates host permissions before broadcasting commands
- Unauthorized commands are rejected with error messages

### Data Validation
- All incoming WebSocket events validate room existence
- User permissions are checked on every state-changing operation

## Future Improvements

If higher security requirements emerge:

1. **Token Rotation** - Implement periodic token refresh with Navidrome
2. **CSP Headers** - Add Content-Security-Policy headers to prevent XSS
3. **Session Timeout** - Auto-logout after inactivity period
4. **WebAuthn** - Use hardware security keys for authentication (requires Navidrome support)
5. **Backend Proxy** - Add dedicated auth server with httpOnly cookies (significant architecture change)

## Reporting Security Issues

If you discover a security vulnerability, please report it via GitHub Issues or contact the maintainers directly. Do not disclose security issues publicly until a fix is available.
