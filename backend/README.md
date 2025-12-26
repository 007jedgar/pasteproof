# PasteProof Self-Hosted Backend

A Cloudflare Worker backend for self-hosting PasteProof for individual usage. This backend provides all the API endpoints needed for the PasteProof browser extension to work in single-user mode.

## Features

- ✅ Single-user authentication via API key
- ✅ Whitelist management
- ✅ Custom pattern detection
- ✅ PII detection logging
- ✅ Audit logs
- ✅ Analytics and statistics
- ✅ AI-powered context-aware PII detection (using Cloudflare Workers AI)
- ✅ Cloudflare KV storage (no database required)

## Setup

### Prerequisites

- Node.js 18+ and npm/pnpm
- Cloudflare account
- Wrangler CLI installed globally: `npm install -g wrangler`

### Installation

1. Install dependencies:

```bash
cd backend
npm install
# or
pnpm install
```

2. Create KV namespaces in Cloudflare:

```bash
# Create KV namespaces
wrangler kv namespace create "WHITELIST_STORE"
wrangler kv namespace create "PATTERNS_STORE"
wrangler kv namespace create "DETECTIONS_STORE"
wrangler kv namespace create "LOGS_STORE"

# Create preview namespaces
wrangler kv namespace create "WHITELIST_STORE" --preview
wrangler kv namespace create "PATTERNS_STORE" --preview
wrangler kv namespace create "DETECTIONS_STORE" --preview
wrangler kv namespace create "LOGS_STORE" --preview
```

3. Update `wrangler.toml` with the KV namespace IDs from step 2.

4. Generate a secure API key:

```bash
openssl rand -hex 32
```

5. Update `wrangler.toml` with your API key:

```toml
[vars]
API_KEY = "your-generated-api-key-here"
```

### Development

Run the worker locally:

```bash
npm run dev
```

The worker will be available at `http://localhost:8787`

Test the health endpoint:

```bash
curl http://localhost:8787/v1/health
```

### Deployment

#### Prerequisites

Before deploying, ensure you have:

1. ✅ All dependencies installed (`npm install` or `pnpm install`)
2. ✅ KV namespaces created and configured in `wrangler.toml`
3. ✅ API key generated and set in `wrangler.toml`
4. ✅ Cloudflare account authenticated with Wrangler:
   ```bash
   wrangler login
   ```

#### Step-by-Step Deployment

1. **Verify Configuration**

   Check that your `wrangler.toml` is properly configured:

   ```bash
   wrangler whoami  # Verify you're logged in
   ```

2. **Test Locally (Optional but Recommended)**

   Test the worker locally before deploying:

   ```bash
   npm run dev
   ```

   Visit `http://localhost:8787/v1/health` to verify it's working.

3. **Deploy to Cloudflare Workers**

   Deploy the worker:

   ```bash
   npm run deploy
   ```

   Or use Wrangler directly:

   ```bash
   wrangler deploy
   ```

4. **Verify Deployment**

   After deployment, you'll see output like:

   ```
   ✨  Deployed successfully!
   🌍  https://pasteproof-backend.your-subdomain.workers.dev
   ```

   Test the health endpoint:

   ```bash
   curl https://pasteproof-backend.your-subdomain.workers.dev/v1/health
   ```

   Expected response:

   ```json
   {
     "status": "ok",
     "timestamp": "2024-01-01T00:00:00.000Z",
     "message": "Paste Proof Backend is running"
   }
   ```

5. **Test Authentication**

   Test that your API key works:

   ```bash
   curl -H "X-API-Key: your-api-key-here" \
        https://pasteproof-backend.your-subdomain.workers.dev/v1/user
   ```

   Expected response:

   ```json
   {
     "id": "single-user",
     "email": "self-hosted@pasteproof.local",
     "subscription_tier": "premium",
     "subscription_status": "active"
   }
   ```

#### Custom Domain (Optional)

To use a custom domain instead of `*.workers.dev`:

1. Add a route in `wrangler.toml`:

   ```toml
   routes = [
     { pattern = "api.yourdomain.com", zone_name = "yourdomain.com" }
   ]
   ```

2. Deploy:

   ```bash
   npm run deploy
   ```

3. Configure DNS in Cloudflare dashboard:
   - Add a CNAME record pointing to your worker
   - Or use Cloudflare's automatic worker routing

#### Troubleshooting

**Deployment fails with "Authentication required"**

- Run `wrangler login` to authenticate

**KV namespace errors**

- Verify all KV namespace IDs are correct in `wrangler.toml`
- Ensure namespaces exist: `wrangler kv namespace list`

**API key not working**

- Verify the API key in `wrangler.toml` matches what you're using
- Check that `[vars]` section is properly formatted

**Worker returns 500 errors**

- Check Cloudflare dashboard → Workers → Logs for error details
- Verify all environment variables are set correctly

#### Updating the Deployment

To update an existing deployment:

```bash
npm run deploy
```

Wrangler will automatically update the worker with your latest code.

#### Viewing Logs

View real-time logs during development:

```bash
wrangler tail
```

View logs in Cloudflare dashboard:

1. Go to Cloudflare Dashboard → Workers & Pages
2. Select your worker
3. Click on "Logs" tab

## Configuration

### Environment Variables

- `API_KEY`: Secret API key for authentication (required)

### KV Namespaces

The backend uses Cloudflare KV for storage:

- `WHITELIST_STORE`: Stores whitelisted domains
- `PATTERNS_STORE`: Stores custom detection patterns
- `DETECTIONS_STORE`: Stores PII detection logs (last 10,000)
- `LOGS_STORE`: Stores audit logs (last 5,000)

## API Endpoints

All endpoints require authentication via `X-API-Key` header.

### Health Check

- `GET /health` - No auth required

### Whitelist

- `GET /v1/whitelist` - Get all whitelisted domains
- `POST /v1/whitelist` - Add domain to whitelist
- `DELETE /v1/whitelist/:id` - Remove domain from whitelist
- `POST /v1/whitelist/check` - Check if domain is whitelisted

### Patterns

- `GET /v1/patterns` - Get all custom patterns
- `POST /v1/patterns` - Create a new pattern
- `DELETE /v1/patterns/:id` - Delete a pattern

### Detections

- `POST /v1/detections` - Log a single detection
- `POST /v1/detections/batch` - Log multiple detections

### Logs

- `POST /v1/log` - Log an audit event
- `GET /v1/logs` - Get audit logs (supports `start`, `end`, `type`, `limit` query params)

### Analytics

- `GET /v1/analytics` - Get analytics (supports `range` query param: `7d` or `30d`)
- `GET /v1/stats` - Get statistics (supports `days` query param)

### User

- `GET /v1/user` - Get user information

### AI Analysis

- `POST /v1/analyze-context` - AI-powered context-aware PII detection

## Usage with Browser Extension

To use this backend with the PasteProof browser extension:

1. Deploy the backend and note the URL (e.g., `https://pasteproof-backend.your-subdomain.workers.dev`)
2. Clone the PasteProof extension repository
3. Create a `.env` file in the extension root directory:
   ```bash
   VITE_SELF_HOSTED_API_URL=https://pasteproof-backend.your-subdomain.workers.dev
   ```
4. Build the extension: `npm run build` or `pnpm build`
5. Load the built extension in your browser
6. The extension will now use your self-hosted backend instead of `api.pasteproof.com`

**Note:**

- The self-hosted mode is configured at build time via environment variables, so it won't appear in the Chrome Web Store version
- You'll need to sign in/create an account on the production site first to get an API key, then use that same API key with your self-hosted backend
- For true single-user mode without an account, you can modify the backend to accept any API key or implement a simpler auth mechanism

## Limitations

- Single-user only (no multi-user support)
- Data stored in Cloudflare KV (subject to KV limits)
- Rate limiting is disabled (can be added if needed)
- No persistent database (data is stored in KV)

## Security Notes

- Keep your API key secret
- Use HTTPS in production
- Consider adding rate limiting for production use
- Review Cloudflare Workers security best practices

## License

Same as the main PasteProof project.
