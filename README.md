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

## Commands

- `/play <query>` - Play a song or playlist from YouTube/Spotify
- `/skip` - Skip the current track
- `/stop` - Stop playback and clear queue
- `/queue` - Display the current queue with interactive buttons
- `/shuffle` - Shuffle the current queue (also available as button)

## Setup

### Prerequisites

- Node.js 16.x or higher
- Discord Bot Token
- Spotify API credentials (Client ID & Secret)
- YouTube cookies (for bypassing bot detection)

### Installation

1. Clone the repository:
```bash
git clone
cd discord-music-bot
```

2. Install dependencies:
```bash
npm install
```

3. Create `.env` file:
```env
DISCORD_TOKEN=
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
YOUTUBE_API_KEY=
DISCORD_CLIENT_ID=
DISCORD_GUILD_ID=
```

4. Export YouTube cookies:
   - Install [Get cookies.txt LOCALLY](https://chrome.google.com/webstore/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc) browser extension
   - Visit YouTube while logged in
   - Click the extension and save `cookies.txt`
   - Place `cookies.txt` in the root directory

5. Build the project:
```bash
npm run build
```

6. Deploy slash commands:
```bash
npm run deploy-commands
```

7. Start the bot:
```bash
npm start
```

## Docker Deployment

1. Build the Docker image:
```bash
docker build -t discord-music-bot .
```

2. Run the container:
```bash
docker run -d \
  -e DISCORD_TOKEN=your_token \
  -e SPOTIFY_CLIENT_ID=your_client_id \
  -e SPOTIFY_CLIENT_SECRET=your_client_secret \
  -v $(pwd)/cookies.txt:/app/cookies.txt \
  discord-music-bot
```

## Railway Deployment

1. Create a new project on [Railway](https://railway.app)
2. Connect your GitHub repository
3. Add environment variables of .env:
4. Upload `cookies.txt` to the Railway volume or project files
5. Deploy!

## How It Works

### Spotify Playback
1. When you play a Spotify playlist, the bot loads the first 10 tracks
2. It searches for each track on YouTube for actual playback
3. When shuffling, it loads more tracks dynamically from the Spotify playlist
4. Thumbnails are fetched from Spotify albums

### YouTube Playback
1. Direct YouTube URLs are played using `play-dl` library
2. If `play-dl` fails, it falls back to `yt-search` for finding alternative URLs
3. Playlists are fully loaded and queued

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

### "Sign in to confirm you're not a bot" error
- Your YouTube cookies are expired or invalid
- Re-export fresh cookies from your browser
- Make sure you're logged into YouTube when exporting cookies

### Bot doesn't play audio
- Check that the bot has proper voice channel permissions
- Verify `cookies.txt` is valid and not HTML content
- Ensure `ffmpeg` is installed (required for audio streaming)

### Spotify tracks not playing
- Verify your Spotify API credentials are correct
- Check that the Spotify playlist is public
- Ensure the bot can access YouTube for playback

### Shuffle doesn't load new tracks
- Make sure you're shuffling a Spotify playlist (not YouTube)
- Check that the playlist has more than 10 tracks
- Verify Spotify API credentials are working

## Technologies Used

- **Discord.js** - Discord API wrapper
- **@discordjs/voice** - Voice connection handling
- **play-dl** - YouTube streaming
- **spotify-web-api-node** - Spotify API integration
- **yt-search** - YouTube search fallback
- **yt-dlp** - YouTube download fallback
- **TypeScript** - Type-safe development

## Contributing

Pull requests are welcome! For major changes, please open an issue first to discuss what you would like to change.

## License

MIT

## Credits

Built with ❤️ for music lovers on Discord