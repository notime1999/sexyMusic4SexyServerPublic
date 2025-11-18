# SexyMusic4SexyServer

A Discord music bot for Spotify and YouTube, with advanced queue management, shuffle, playlists, and search.

## Main Features

- Play from Spotify (playlists, albums, single tracks)
- Play from YouTube (playlists, single videos)
- **Slash Commands**: `/play`, `/queue`, `/shuffle`, `/stop`, `/skip`
- Queue management: view, shuffle, skip, remove tracks
- Multi-server support
- Separate display for the currently playing track

## Main Commands

- `/play <url or search>` — Play a track, playlist, or search on YouTube/Spotify
- `/queue` — Show the queue and the currently playing track
- `/shuffle` — Shuffle the queue (the currently playing track does not change)
- `/stop` — Stop playback and clear the queue
- `/skip` — Skip to the next song

## Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file in the project root (see example below)
4. Register the Slash Commands:
   ```bash
   npx ts-node src/commands/deploy-commands.ts
   ```
5. Build the project:
   ```bash
   npm run build
   ```
6. Start the bot:
   ```bash
   npm start
   ```

## Example `.env`

```
DISCORD_TOKEN=your_token
DISCORD_CLIENT_ID=your_client_id
DISCORD_GUILD_ID=your_guild_id
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
YOUTUBE_API_KEY=your_youtube_api_key
```

Fill in the values with your own API keys and tokens.

## About `cookies.txt`

Some YouTube features (such as playing age-restricted or region-locked content, or bypassing certain rate limits) may require a valid `cookies.txt` file.  
This file contains your YouTube account cookies and allows the bot to access content as if it were logged in.

- If you need to use a `cookies.txt`, place it in the `/app` directory (for Railway or Docker) or in the project root as `cookies.txt`.
- You can generate a `cookies.txt` file using browser extensions like [Get cookies.txt](https://chrome.google.com/webstore/detail/get-cookiestxt/).
- **Never share your cookies.txt publicly** as it grants access to your YouTube account.

If you deploy on Railway or similar platforms, you can automate the download of `cookies.txt` by editing the `download-cookies` script in your `package.json`:
```json
"download-cookies": "node -e \"require('fs').mkdirSync('/app', {recursive:true})\" && curl -L -o /app/cookies.txt https://your-domain.com/cookies.txt"
```
Replace `https://your-domain.com/cookies.txt` with your actual file URL, or remove this script if you do not need cookies.

## Notes

- Make sure you have ffmpeg installed on your system.
- For YouTube, some advanced features may require a valid cookies.txt file.
- For Spotify, you need an app registered on the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard).
- Commands are now **Slash Commands only** (`/play`, `/skip`, etc.) and will automatically appear in the Discord menu.

---

**For issues or suggestions, open an issue or contact the maintainer!**
