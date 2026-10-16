# Roblox Tracker Bot (original features restored)

## Railway setup
1. Upload `index.js` and `package.json` to the root of your GitHub repo, replacing the current `index.js`.
2. In Railway, keep the existing `DISCORD_TOKEN` variable. The bot reads it from `process.env.DISCORD_TOKEN`.
3. Push/commit the changes to the connected branch and wait for Railway to deploy.

The original tracker features are retained. Minimal fixes applied: `pad_str` -> `padStr`, channel mention formatting, and reading `DISCORD_TOKEN` from environment variables.
