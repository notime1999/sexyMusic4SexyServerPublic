# Discord Music Bot

A powerful Discord music bot that supports both YouTube and Spotify playback with queue management, shuffle, and interactive controls.

## Features

- 🎵 **YouTube Support**: Play songs, playlists, and search results from YouTube
- 🎧 **Spotify Integration**: Play tracks and playlists from Spotify (searches on YouTube for playback)
- 📋 **Queue Management**: Add multiple tracks, view queue, and manage playback
- 🔀 **Shuffle**: Randomize your playlist with smart loading
- ⏭️ **Skip & Stop**: Full playback controls with interactive buttons
- 🖼️ **Thumbnails**: Display album/video artwork in queue messages
- 🎮 **Interactive Buttons**: Shuffle, Skip, and Stop buttons on queue messages
- 🚀 **yt-dlp Integration**: Uses yt-dlp binary for reliable streaming (no cookies needed!)
- ☁️ **Railway Ready**: Fully configured for Railway deployment

## Commands

- `/play <query>` - Play a song or playlist from YouTube/Spotify
- `/skip` - Skip the current track
- `/stop` - Stop playback and clear queue
- `/queue` - Display the current queue with interactive buttons
- `/shuffle` - Shuffle the current queue (also available as button)

## Setup

### Prerequisites

- Node.js 20.x or higher
- Discord Bot Token
- Spotify API credentials (Client ID & Secret)
- YouTube API Key (optional, for search fallback)
- yt-dlp binary (automatically installed via Docker/Railway)

### Local Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd discord-music-bot
```

2. Install dependencies:
```bash
npm install
```

3. Install yt-dlp:
   - **Windows**: Download from [yt-dlp releases](https://github.com/yt-dlp/yt-dlp/releases) and add to PATH
   - **Linux/Mac**: `sudo wget https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -O /usr/local/bin/yt-dlp && sudo chmod a+rx /usr/local/bin/yt-dlp`

4. Create `.env` file:
```env
DISCORD_TOKEN=your_discord_bot_token
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
YOUTUBE_API_KEY=your_youtube_api_key_optional
DISCORD_CLIENT_ID=your_discord_client_id
DISCORD_GUILD_ID=your_discord_guild_id
```

5. Build the project:
```bash
npm run build
```

6. Deploy slash commands:
```bash
node dist/commands/deploy-commands.js
```

7. Start the bot:
```bash
npm start
```

## Railway Deployment (Recommended)

This bot is **fully configured** for Railway deployment with automatic yt-dlp installation!

1. Fork/Clone this repository to your GitHub account

2. Create a new project on [Railway](https://railway.app)

3. Click **"Deploy from GitHub repo"** and select your repository

4. Add environment variables in Railway dashboard:
   - `DISCORD_TOKEN` - Your Discord bot token
   - `SPOTIFY_CLIENT_ID` - Your Spotify Client ID
   - `SPOTIFY_CLIENT_SECRET` - Your Spotify Client Secret
   - `YOUTUBE_API_KEY` - Your YouTube API Key (optional, for search fallback)
   - `DISCORD_CLIENT_ID` - Your Discord application ID
   - `DISCORD_GUILD_ID` - Your Discord server ID (optional, for faster command deployment)

5. Railway will automatically:
   - Detect the `Dockerfile`
   - Install Node.js, Python, FFmpeg, and yt-dlp
   - Build the TypeScript project
   - Deploy the bot

6. Your bot will be online in 2-3 minutes! 🚀

### Why Railway?

- ✅ **No cookies needed** - yt-dlp works out of the box
- ✅ **Pre-configured Dockerfile** - Everything is automated
- ✅ **Free tier available** - Perfect for small servers
- ✅ **Auto-restarts** - Bot restarts automatically if it crashes
- ✅ **Easy logs** - View bot logs directly in Railway dashboard

## Docker Deployment

The Dockerfile is optimized for Railway but works anywhere:

```bash
docker build -t discord-music-bot .
docker run -d \
  -e DISCORD_TOKEN=your_token \
  -e SPOTIFY_CLIENT_ID=your_client_id \
  -e SPOTIFY_CLIENT_SECRET=your_client_secret \
  -e YOUTUBE_API_KEY=your_youtube_api_key \
  -e DISCORD_CLIENT_ID=your_client_id \
  -e DISCORD_GUILD_ID=your_guild_id \
  discord-music-bot
```

## How It Works

### Spotify Playback
1. When you play a Spotify playlist, the bot loads the first 10 tracks
2. It searches for each track on YouTube for actual playback
3. When shuffling, it loads more tracks dynamically from the Spotify playlist
4. Thumbnails are fetched from Spotify albums

### YouTube Playback via yt-dlp
1. The bot uses **yt-dlp binary** to extract YouTube audio streams
2. **No cookies or authentication required** - works on any server
3. Uses `youtube-dl-exec` npm package for Node.js integration
4. Automatically handles YouTube's bot detection and rate limiting
5. Supports playlists up to 50 videos (configurable)

### YouTube Search
- Primary: Uses `yt-search` npm package (no API key needed)
- Fallback: YouTube Data API v3 (requires `YOUTUBE_API_KEY`)
- The bot works without API key using `yt-search` for most queries

### Queue Management
- Interactive buttons (Shuffle, Skip, Stop) on queue messages
- Automatic queue updates after each action
- Smart loading: only loads 10 tracks at a time for large playlists
- Displays track thumbnails from YouTube/Spotify
- `/shuffle` command or button randomizes the queue and loads new tracks

### Shuffle Feature
- **Command**: Use `/shuffle` to randomize the current queue
- **Button**: Click the "Shuffle" button on any queue message
- **Smart Loading**: Automatically loads 10 new random tracks from Spotify playlists
- **Preserves Current Track**: The currently playing song continues playing

## Troubleshooting

### Bot doesn't play audio
- Check that the bot has proper voice channel permissions
- Verify that `yt-dlp` is installed and in PATH
- Ensure `ffmpeg` is installed (required for audio streaming)
- On Railway: Check deployment logs for errors

### Spotify tracks not playing
- Verify your Spotify API credentials are correct
- Check that the Spotify playlist is public
- Ensure the bot can access YouTube via yt-dlp for playback

### YouTube search not working
- The bot uses `yt-search` by default (no API key needed)
- If you get rate limited, add `YOUTUBE_API_KEY` to fallback to official API
- Get API key from [Google Cloud Console](https://console.cloud.google.com/)

### Shuffle doesn't load new tracks
- Make sure you're shuffling a Spotify playlist (not YouTube)
- Check that the playlist has more than 10 tracks
- Verify Spotify API credentials are working

### YouTube playlist shows empty titles
- This is fixed in the latest version using `youtube-dl-exec`
- Update to the latest code and rebuild
- On Railway: Trigger a new deployment

### yt-dlp fails with "Sign in to confirm you're not a bot"
- This should **not happen on Railway** (fresh IP addresses)
- If it does, try redeploying (Railway gives you a new IP)
- As a last resort, you can add cookies (see yt-dlp documentation)

## Technologies Used

- **Discord.js v14** - Discord API wrapper
- **@discordjs/voice** - Voice connection handling
- **youtube-dl-exec** - Node.js wrapper for yt-dlp binary
- **yt-dlp** - YouTube video/audio downloader (no cookies needed!)
- **spotify-web-api-node** - Spotify API integration
- **yt-search** - YouTube search without API key
- **TypeScript** - Type-safe development
- **Docker** - Containerized deployment

## Performance

- **Fast startup**: Bot connects in ~5 seconds
- **Low latency**: Audio streams start in 1-2 seconds
- **Memory efficient**: Uses ~150MB RAM on Railway free tier
- **Reliable**: Auto-restarts on crashes, handles network errors gracefully

## Contributing

Pull requests are welcome! For major changes, please open an issue first to discuss what you would like to change.

## License

MIT

## Credits

Built with ❤️ for music lovers on Discord

