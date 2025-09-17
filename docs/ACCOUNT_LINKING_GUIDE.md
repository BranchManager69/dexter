# Dexter Account Linking System - Testing Guide

## Overview
The account linking system allows MCP users (Claude/ChatGPT) to connect their OAuth identity with their Dexter website account.

## Architecture
- **MCP OAuth**: Handles Claude/ChatGPT authentication (existing system - DO NOT MODIFY)
- **Supabase Auth**: Handles website authentication  
- **Account Links**: Bridges the two systems via secure 6-character codes

## Testing the MCP Tools

### 1. From Claude Desktop or ChatGPT
These tools are available in your MCP session:

```
# Check if you have a linked account
check_dexter_account_link

# Generate a linking code (if not linked)
generate_dexter_linking_code

# Get details about your linked account
get_linked_dexter_account

# Unlink your account (for testing)
unlink_dexter_account confirm=true
```

### 2. Testing Flow

#### Step 1: Check Current Status
```
check_dexter_account_link
```
Expected: "No Dexter account linked"

#### Step 2: Generate Linking Code
```
generate_dexter_linking_code
```
Expected: Returns a 6-character code like "A3K9P2"

#### Step 3: Complete Linking on Website
1. Visit https://dexter.cash/link
2. Log in with your Dexter account (if not already)
3. Enter the 6-character code
4. Click "Link Account"

#### Step 4: Verify Link
```
check_dexter_account_link
```
Expected: Shows linked account details

#### Step 5: Test Unlinking (Optional)
```
unlink_dexter_account confirm=true
```
Expected: "Successfully unlinked Dexter account"

## Testing the Web UI

### Direct Browser Testing
1. Navigate to https://dexter.cash/link
2. The page will:
   - Check authentication status
   - Show existing linked accounts
   - Allow entering a 6-character code

### Features to Test
- **Auto-advance**: Type one character, cursor moves to next box
- **Paste support**: Paste full 6-character code at once
- **Validation**: Only accepts A-Z, 0-9 (no confusing characters)
- **Error handling**: Invalid/expired codes show appropriate messages

## Testing API Endpoints

### Using curl (from server)
```bash
# Check link status (requires auth token)
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/api/link/status

# Verify a code
curl -X POST -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"code":"A3K9P2"}' \
  http://localhost:3000/api/link/verify
```

### Direct Identity API (advanced)
```bash
# Resolve Supabase user id from an OAuth identity (service use)
curl "http://localhost:3000/api/identity/resolve?provider=claude&subject=user-123"

# Link current Supabase user to an OAuth identity (no code flow)
curl -X POST -H "Authorization: Bearer YOUR_TOKEN" -H "Content-Type: application/json" \
  -d '{"provider":"claude","subject":"user-123"}' \
  http://localhost:3000/api/identity/link

# Unlink a specific identity
curl -X POST -H "Authorization: Bearer YOUR_TOKEN" -H "Content-Type: application/json" \
  -d '{"provider":"claude","subject":"user-123"}' \
  http://localhost:3000/api/identity/unlink
```

## Database Verification

### Check linking_codes table
```bash
node -e "require('./config/prisma.js').default.linking_codes.findMany({ orderBy: { created_at: 'desc' }, take: 5 }).then(r => { console.log('=== Recent Linking Codes ==='); r.forEach(c => console.log(c.code + ' - ' + (c.used ? 'USED' : 'ACTIVE') + ' - Expires: ' + c.expires_at)); }).catch(console.error).finally(() => process.exit())"
```

### Check account_links table
```bash
node -e "require('./config/prisma.js').default.account_links.findMany({ orderBy: { linked_at: 'desc' }, take: 5 }).then(r => { console.log('=== Recent Account Links ==='); r.forEach(l => console.log(l.oauth_provider + '/' + l.oauth_subject + ' -> ' + l.supabase_user_id)); }).catch(console.error).finally(() => process.exit())"
```

## Security Features

### Code Generation
- 6 characters from: `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`
- Excludes confusing characters: 0/O, 1/I/L
- Cryptographically random generation

### Code Validation
- **Expiration**: 10 minutes from generation
- **Single use**: Codes marked as used after successful link
- **Rate limiting**: 1 minute cooldown between generations
- **Attempt limit**: 3 failed attempts per code
- **Cleanup**: Expired codes auto-deleted on new generation

### Identity Verification
- MCP OAuth headers (`X-User-Issuer`, `X-User-Sub`) identify the MCP user
- Supabase JWT identifies the website user
- Link created only after both identities verified

## Troubleshooting

### "no_oauth_identity" Error
- MCP OAuth headers not present
- Solution: Ensure using MCP with OAuth enabled

### "Already linked" Error  
- Account already has a link
- Solution: Use `unlink_dexter_account` first

### Code Not Working
- Check if expired (10 minute limit)
- Verify correct code (no O/0, I/1/L confusion)
- Generate a new code if needed

### Database Connection Issues
```bash
# Test Prisma connection
node -e "require('./config/prisma.js').default.\$connect().then(() => console.log('Connected!')).catch(console.error).finally(() => process.exit())"
```

## Implementation Files

### MCP Tools
`/alpha/dexter-mcp/tools/account-linking.mjs`
- check_dexter_account_link
- generate_dexter_linking_code  
- get_linked_dexter_account
- unlink_dexter_account

### API Routes
`/token-ai/server/routes/linking.js`
- POST /api/link/verify
- GET /api/link/status
- POST /api/link/generate
- POST /api/link/remove

### Web UI
`/public/link.html`
- Account linking interface
- Uses `/js/auth.js` for Supabase auth

### Database Schema
`/prisma/schema.prisma`
- account_links table
- linking_codes table

## Notes
- The system maintains complete separation from MCP OAuth
- Never modify the existing MCP OAuth setup (it was hard to get working)
- Account links persist indefinitely until explicitly unlinked
- Multiple MCP providers can link to the same Dexter account
