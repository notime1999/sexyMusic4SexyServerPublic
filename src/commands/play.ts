import { Message, ChatInputCommandInteraction, GuildMember } from 'discord.js';
import {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    TextChannel
} from 'discord.js';
import { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, NoSubscriberBehavior, entersState, VoiceConnectionStatus, StreamType } from '@discordjs/voice';
import playdl from 'play-dl';
import StreamManager from '../audio/streamManager';
import { searchSpotify, searchYouTube as searchSpotifyYT, getPlaylistSummary } from '../services/spotify';
import { searchYouTube as searchYouTubeService } from '../services/youtube';
import ytpl from 'ytpl';
// @ts-ignore
import yts from 'yt-search';
import youtubedl from 'youtube-dl-exec';
import path from 'path';
import GuildPlayer from '../audio/guildPlayer';
import { ensureSpotifyToken } from '../services/spotify';
import spotifyApi from '../services/spotify';
import { getPlaylistTracks } from '../services/spotify';
import { spawn } from 'child_process';
import { Readable, PassThrough } from 'stream';
import fsPromises from 'fs/promises';

const streamManager = new StreamManager();


async function checkCookiesFile(channel: any) {
    let cookiePath = './cookies.txt';
    try {
        await fsPromises.access(cookiePath).catch(async () => {
            cookiePath = '/app/cookies.txt';
            await fsPromises.access(cookiePath);
        });
        const cookies = await fsPromises.readFile(cookiePath, 'utf-8');
        if (!cookies.trim() || cookies.includes('404') || cookies.includes('<html')) {
            await channel.send('⚠️ Cookies are expired, invalid or file is not correct! Update cookies.txt.');
            return false;
        }
        return true;
    } catch (err) {
        await channel.send('⚠️ Error reading cookies.txt!');
        return false;
    }
}

export const execute = async (interaction: ChatInputCommandInteraction, args: string[] = []) => {
    // DEFER IMMEDIATELY - FIRST THING!
    try {
        await interaction.deferReply();
    } catch (e) {
        console.error('[play] Failed to defer reply:', e);
        return;
    }

    console.log("EXECUTING PLAY", Date.now(), interaction.id, interaction.commandName, args);
    let query = args.join(' ').trim();

    const ytPlaylistMatch = query.match(/[?&]list=([A-Za-z0-9_-]+)/);
    const playlistId = ytPlaylistMatch ? ytPlaylistMatch[1] : null;
    const isYouTubePlaylist = query.includes('youtube.com/playlist') || (query.includes('youtube.com/watch') && query.includes('&list='));
    const isSpotifyPlaylist = query.includes('open.spotify.com/playlist');

    console.log('[play] query=', query, 'isYouTubePlaylist=', isYouTubePlaylist, 'isSpotifyPlaylist=', isSpotifyPlaylist);

    // Check if user is in voice channel AFTER defer
    const member = interaction.member as GuildMember;
    if (!member || !member.voice?.channel) {
        return interaction.editReply('You must be in a voice channel to play music.');
    }

    let replyUpdated = false;

    setTimeout(async () => {
        if (!replyUpdated) {
            try {
                await interaction.deleteReply();
            } catch { }
        }
    }, 60000);

    if (isYouTubePlaylist) {
        console.log('[play] YouTube playlist ID:', playlistId);
        
        try {
            // Use youtube-dl-exec to get playlist info
            const playlistInfo: any = await youtubedl(query, {
                dumpSingleJson: true,
                noWarnings: true,
                flatPlaylist: true,
                skipDownload: true,
                playlistEnd: 50  // LIMIT TO 50 VIDEOS MAX
            });

            const videos = playlistInfo?.entries || [];
            console.log('[play] Found', videos.length, 'videos in YouTube playlist');

            if (videos.length === 0) {
                return interaction.editReply('❌ No videos found in playlist.');
            }

            const gp = GuildPlayer.create(interaction.guild!.id, member.voice.channel);
            gp.startedBy = interaction.user.username;
            gp.lastAction = `YouTube playlist with ${videos.length} songs`;

            for (const video of videos) {
                if (!video || !video.id) continue;
                
                // Get best thumbnail URL
                let thumbnail = `https://img.youtube.com/vi/${video.id}/maxresdefault.jpg`;
                if (video.thumbnail) {
                    thumbnail = video.thumbnail;
                } else if (video.thumbnails && video.thumbnails.length > 0) {
                    thumbnail = video.thumbnails[video.thumbnails.length - 1].url;
                }
                
                const track = {
                    url: `https://www.youtube.com/watch?v=${video.id}`,
                    title: video.title || video.id || 'Unknown Title',
                    requestedBy: interaction.user.username,
                    source: 'YouTube' as const,
                    thumbnail: thumbnail
                };
                
                gp.enqueue(track, false);
            }

            await gp.playNext();

            // DELETE OLD QUEUE MESSAGE
            await gp.deleteQueueMessage(interaction.client);

            // BUILD EMBED
            const nowPlaying = gp.getCurrent();
            const maxQueueToShow = 10;
            const more = gp.queue.length > maxQueueToShow ? `\n...and ${gp.queue.length - maxQueueToShow} more` : '';
            let queueStr = buildQueueList(gp.queue.slice(0, maxQueueToShow)) + more;
            if (!queueStr.trim()) queueStr = 'No tracks in queue.';
            if (queueStr.length > 1024) queueStr = queueStr.slice(0, 1021) + '...';

            const fields = [
                { name: 'Now playing', value: nowPlaying?.title ?? 'Nothing' },
                { name: 'Queue', value: queueStr },
                { name: 'Started by', value: gp.startedBy || 'Unknown', inline: true }
            ];
            if (gp.lastAction) {
                fields.push({ name: 'Last action', value: gp.lastAction, inline: true });
            }

            const embed = new EmbedBuilder()
                .setTitle('Music Queue')
                .addFields(fields)
                .setColor(0x00FF00);

            // Always set thumbnail from now playing
            if (nowPlaying?.thumbnail) {
                embed.setThumbnail(nowPlaying.thumbnail);
            }

            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder().setCustomId('shuffle').setLabel('Shuffle').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('skip').setLabel('Skip').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('stop').setLabel('Stop').setStyle(ButtonStyle.Danger)
            );

            await interaction.editReply({ embeds: [embed], components: [row] });
            replyUpdated = true;
            const sent = await interaction.fetchReply();
            gp.queueMessageId = sent.id;
            gp.queueChannelId = sent.channelId;
        } catch (error) {
            console.error('[play] Failed to fetch YouTube playlist:', error);
            return interaction.editReply('❌ Failed to fetch YouTube playlist. Please try again.');
        }
        return;
    }

    if (isSpotifyPlaylist) {
        const voiceChannel = member.voice.channel;
        const gp = GuildPlayer.get(voiceChannel.guild.id) || GuildPlayer.create(voiceChannel.guild.id, voiceChannel);
        
        if (!gp.startedBy) {
            gp.startedBy = interaction.member?.user?.username || interaction.user.username;
        }
        
        if (!gp.ensureVoiceConnection()) {
            return interaction.editReply('Cannot connect to voice channel.');
        }
        
        const playlistId = extractSpotifyPlaylistId(query);
        let tracks: any[] = [];
        try {
            tracks = await getPlaylistTracks(query);
        } catch (err) {
            console.error('[Spotify] getPlaylistTracks error:', err);
            return interaction.editReply('Error retrieving Spotify playlist.');
        }
        console.log('[play] getPlaylistTracks returned', tracks.length, 'tracks');
        if (!tracks || tracks.length === 0) {
            return interaction.editReply('Spotify playlist found but empty or not accessible.');
        }

        const MAX_TRACKS = 10;
        const tracksToEnqueue: any[] = [];
        
        for (let i = 0; i < tracks.length && tracksToEnqueue.length < MAX_TRACKS; i++) {
            const t = tracks[i];
            console.log(`[Spotify] Adding track ${tracksToEnqueue.length + 1}/${MAX_TRACKS}: ${t.name} - ${t.artists.join(', ')}`);
            
            tracksToEnqueue.push({
                url: t.url || `spotify:track:${t.id}`,
                title: `${t.name} - ${t.artists.join(', ')}`,
                spotifyPlaylistId: playlistId ?? undefined,
                spotifyIndex: i,
                spotifyName: t.name,
                spotifyArtists: t.artists,
                spotifyId: t.id,
                requestedBy: interaction.user.tag,
                source: 'Spotify',
                thumbnail: t.album?.images?.[0]?.url
            });
        }

        if (tracksToEnqueue.length === 0) {
            return interaction.editReply('No valid tracks in Spotify playlist.');
        }

        for (const track of tracksToEnqueue) {
            gp.enqueue(track, false);
        }

        if (!gp.getCurrent()) {
            await gp.playNext();
        }

        gp._playlistTracks = tracks;
        gp._playlistPointer = MAX_TRACKS;
        gp._playlistId = playlistId ?? undefined;
        gp._lastRequester = interaction.user.tag;

        console.log('[Spotify] Final queue:', gp.queue.map(t => ({
            spotifyIndex: t.spotifyIndex,
            title: t.title
        })));

        await gp.deleteQueueMessage(interaction.client);

        const nowPlaying = gp.getCurrent();
        const maxQueueToShow = 10;
        const more = gp.queue.length > maxQueueToShow ? `\n...and ${gp.queue.length - maxQueueToShow} more` : '';
        let queueStr = buildQueueList(gp.queue.slice(0, maxQueueToShow)) + more;
        if (!queueStr.trim()) queueStr = 'No tracks in queue.';
        if (queueStr.length > 1024) queueStr = queueStr.slice(0, 1021) + '...';

        const requester = interaction.member?.user?.username || interaction.user.username;

        const embed = new EmbedBuilder()
            .setTitle('Music Queue')
            .addFields(
                { name: 'Now playing', value: nowPlaying?.title ?? 'Nothing' },
                { name: 'Queue', value: queueStr },
                { name: 'Requested by', value: requester, inline: true }
            );

        if (nowPlaying?.thumbnail) {
            embed.setThumbnail(nowPlaying.thumbnail);
        } else if (nowPlaying?.url && nowPlaying.url.includes('youtube.com')) {
            const videoId = nowPlaying.url.match(/[?&]v=([^&]+)/)?.[1];
            if (videoId) {
                embed.setThumbnail(`https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`);
            }
        }

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId('shuffle').setLabel('Shuffle').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('skip').setLabel('Skip').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('stop').setLabel('Stop').setStyle(ButtonStyle.Danger)
        );

        await interaction.editReply({ embeds: [embed], components: [row] });
        replyUpdated = true;
        const sent = await interaction.fetchReply();
        gp.queueMessageId = sent.id;
        gp.queueChannelId = sent.channelId;
        return;
    }

    let songInfo: { url?: string; title?: string } | null = null;
    songInfo = await searchSpotify(query);
    if (!songInfo) {
        songInfo = await searchSpotifyYT(query) || await searchYouTubeService(query);

        if (!songInfo) {
            try {
                const r = await yts(query);
                const v = r.videos?.[0];
                if (v) songInfo = { url: v.url, title: v.title };
            } catch (e) {
                console.error('[play] yts error:', e);
            }
        }
    }

    if (!songInfo || !songInfo.url) {
        return interaction.editReply('Could not find any results for your query.');
    }

    const voiceChannel = member.voice.channel;

    const gp = GuildPlayer.get(voiceChannel.guild.id) || GuildPlayer.create(voiceChannel.guild.id, voiceChannel);
    if (!gp.startedBy) {
        gp.startedBy = interaction.member?.user?.username || interaction.user.username;
    }
    
    if (!gp.ensureVoiceConnection()) {
        return interaction.editReply('Cannot connect to voice channel.');
    }

    const trackSource = query.includes('spotify.com') ? 'Spotify' : 'YouTube';
    
    let thumbnail: string | undefined;
    if (trackSource === 'YouTube' && songInfo.url) {
        const videoId = songInfo.url.match(/[?&]v=([^&]+)/)?.[1];
        if (videoId) {
            thumbnail = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
        }
    }
    
    gp.enqueue({
        url: songInfo.url,
        title: songInfo.title ?? songInfo.url,
        requestedBy: interaction.user.tag,
        source: trackSource,
        thumbnail
    }, false);

    const wasPlaying = gp.getCurrent() !== null;
    
    if (!wasPlaying) {
        console.log('[play] Starting playback for single track');
        await gp.playNext();
    } else {
        console.log('[play] Track added to queue, already playing');
    }

    const nowPlaying = gp.getCurrent();
    const maxQueueToShow = 10;
    const more = gp.queue.length > maxQueueToShow ? `\n...and ${gp.queue.length - maxQueueToShow} more` : '';
    let queueStr = buildQueueList(gp.queue.slice(0, maxQueueToShow)) + more;
    if (!queueStr.trim()) queueStr = 'No tracks in queue.';
    if (queueStr.length > 1024) queueStr = queueStr.slice(0, 1021) + '...';

    const startedBy = gp.startedBy || 'Unknown';

    const fields = [
        { name: 'Now playing', value: nowPlaying?.title ?? 'Nothing' },
        { name: 'Queue', value: queueStr },
        { name: 'Started by', value: startedBy, inline: true }
    ];
    if (gp.lastAction) {
        fields.push({ name: 'Last action', value: gp.lastAction, inline: true });
    }

    const embed = new EmbedBuilder()
        .setTitle('Music Queue')
        .addFields(fields);

    if (nowPlaying?.thumbnail) {
        embed.setThumbnail(nowPlaying.thumbnail);
    } else if (nowPlaying?.url && nowPlaying.url.includes('youtube.com')) {
        const videoId = nowPlaying.url.match(/[?&]v=([^&]+)/)?.[1];
        if (videoId) {
            embed.setThumbnail(`https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`);
        }
    }

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('shuffle').setLabel('Shuffle').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('skip').setLabel('Skip').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('stop').setLabel('Stop').setStyle(ButtonStyle.Danger)
    );

    await gp.deleteQueueMessage(interaction.client);

    await interaction.editReply({ embeds: [embed], components: [row] });
    replyUpdated = true;
    const sent = await interaction.fetchReply();
    gp.queueMessageId = sent.id;
    gp.queueChannelId = sent.channelId;
};

// YOUTUBE-DL-EXEC - NO COOKIES NEEDED
export async function streamWithYoutubeDl(url: string) {
    console.log('[play] Using youtube-dl-exec for:', url);
    
    try {
        const info: any = await youtubedl(url, {
            dumpSingleJson: true,
            noCheckCertificates: true,
            noWarnings: true,
            preferFreeFormats: true,
            addHeader: ['referer:youtube.com', 'user-agent:googlebot']
        });

        if (!info || typeof info === 'string') {
            throw new Error('Invalid response from youtube-dl-exec');
        }

        const audioFormat = info.formats?.find((f: any) => 
            f.acodec !== 'none' && f.vcodec === 'none'
        ) || info.formats?.find((f: any) => f.acodec !== 'none');

        if (!audioFormat || !audioFormat.url) {
            throw new Error('No audio format found');
        }

        console.log('[play] Found audio URL from youtube-dl-exec');
        
        const response = await fetch(audioFormat.url);
        if (!response.ok) throw new Error('Failed to fetch audio stream');
        
        return { stream: Readable.fromWeb(response.body as any), type: 'arbitrary' as const };
    } catch (err) {
        console.error('[play] youtube-dl-exec failed:', err);
        throw err;
    }
}

function extractSpotifyPlaylistId(url: string): string | null {
    try {
        const u = new URL(url);
        const parts = u.pathname.split('/').filter(Boolean);
        const idx = parts.findIndex(p => p === 'playlist');
        if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
    } catch (e) {
        const m = url.match(/playlist\/([A-Za-z0-9_-]+)/);
        if (m && m[1]) return m[1];
    }
    return null;
}

export function buildQueueList(tracks: any[]): string {
    return tracks.map((t, i) => {
        const urlDisplay = (t.url && !t.url.startsWith('spotify:')) ? `` : '';
        const sourceTag = t.source ? ` [${t.source}]` : '';
        return `${i + 1}. ${t.title}${sourceTag}${urlDisplay}`;
    }).join('\n');
}

// USE YT-DLP WITH PUBLIC PROXY - NO COOKIES NEEDED
export async function streamWithYtDlp(url: string) {
    console.log('[play] Using yt-dlp binary with proxy for:', url);
    
    return new Promise<{ stream: Readable; type: any }>((resolve, reject) => {
        const ytDlp = spawn('yt-dlp', [
            '-f', 'bestaudio',
            '-o', '-',
            '--no-warnings',
            '--no-playlist',
            '--format-sort', 'acodec:opus',
            '--proxy', 'socks5://proxy.soax.com:1080', // Free SOCKS5 proxy
            '--socket-timeout', '30',
            '--retries', '3',
            '--extractor-args', 'youtube:player_client=android',
            '--extractor-args', 'youtube:player_skip=webpage',
            '--user-agent', 'com.google.android.youtube/19.09.37 (Linux; U; Android 14)',
            url
        ]);

        const stream = new PassThrough();
        
        ytDlp.stdout.pipe(stream);
        
        ytDlp.stderr.on('data', (data) => {
            console.log('[yt-dlp]', data.toString());
        });

        ytDlp.on('error', (err) => {
            console.error('[yt-dlp] spawn error:', err);
            reject(err);
        });

        ytDlp.on('close', (code) => {
            if (code !== 0 && code !== null) {
                console.error('[yt-dlp] exited with code:', code);
                reject(new Error(`yt-dlp exited with code ${code}`));
            }
        });

        // Wait a bit to ensure stream is ready
        setTimeout(() => {
            console.log('[play] yt-dlp stream ready');
            resolve({ stream, type: StreamType.Arbitrary });
        }, 1000);
    });
}

// USE PIPED API WITH INVIDIOUS FALLBACK - STREAMING PROXY WITHOUT COOKIES
export async function streamWithPiped(url: string) {
    console.log('[play] Using Piped/Invidious API for:', url);
    
    try {
        const videoId = url.match(/[?&]v=([^&]+)/)?.[1];
        if (!videoId) throw new Error('Invalid YouTube URL');
        
        // Try Piped instances first
        const pipedInstances = [
            'https://pipedapi.kavin.rocks',
            'https://pipedapi.adminforge.de',
            'https://api-piped.mha.fi'
        ];
        
        for (const instance of pipedInstances) {
            try {
                console.log('[Piped] Trying instance:', instance);
                const proxyUrl = `${instance}/streams/${videoId}`;
                const response = await fetch(proxyUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    },
                    signal: AbortSignal.timeout(10000)
                });
                
                if (!response.ok) {
                    console.log('[Piped] Instance failed with status:', response.status);
                    continue;
                }
                
                const data = await response.json();
                const audioStream = data.audioStreams?.find((s: any) => 
                    s.quality === 'MEDIUM' || s.quality === 'HIGH'
                ) || data.audioStreams?.[0];
                
                if (!audioStream || !audioStream.url) {
                    console.log('[Piped] No audio stream found');
                    continue;
                }
                
                console.log('[Piped] Found audio stream:', audioStream.quality);
                
                const streamResponse = await fetch(audioStream.url, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    }
                });
                
                if (!streamResponse.ok) {
                    console.log('[Piped] Stream URL failed with status:', streamResponse.status);
                    continue;
                }
                
                console.log('[play] Piped stream created successfully');
                return { 
                    stream: Readable.fromWeb(streamResponse.body as any), 
                    type: StreamType.Arbitrary 
                };
            } catch (err) {
                console.log('[Piped] Instance error:', err);
                continue;
            }
        }
        
        // Fallback to Invidious
        console.log('[play] All Piped instances failed, trying Invidious...');
        const invidiousInstances = [
            'https://inv.tux.pizza',
            'https://invidious.private.coffee',
            'https://yt.artemislena.eu'
        ];
        
        for (const instance of invidiousInstances) {
            try {
                console.log('[Invidious] Trying instance:', instance);
                const apiUrl = `${instance}/api/v1/videos/${videoId}`;
                const response = await fetch(apiUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    },
                    signal: AbortSignal.timeout(10000)
                });
                
                if (!response.ok) {
                    console.log('[Invidious] Instance failed with status:', response.status);
                    continue;
                }
                
                const data = await response.json();
                const audioFormat = data.adaptiveFormats?.find((f: any) => 
                    f.type?.includes('audio')
                ) || data.formatStreams?.[0];
                
                if (!audioFormat || !audioFormat.url) {
                    console.log('[Invidious] No audio format found');
                    continue;
                }
                
                console.log('[Invidious] Found audio format');
                
                const streamResponse = await fetch(audioFormat.url, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    }
                });
                
                if (!streamResponse.ok) {
                    console.log('[Invidious] Stream URL failed with status:', streamResponse.status);
                    continue;
                }
                
                console.log('[play] Invidious stream created successfully');
                return { 
                    stream: Readable.fromWeb(streamResponse.body as any), 
                    type: StreamType.Arbitrary 
                };
            } catch (err) {
                console.log('[Invidious] Instance error:', err);
                continue;
            }
        }
        
        throw new Error('All Piped and Invidious instances failed');
    } catch (err) {
        console.error('[play] All proxies failed:', err);
        throw err;
    }
}

// USE PLAY-DL WITH CUSTOM AGENT - NO COOKIES NEEDED
export async function streamWithPlayDl(url: string) {
    console.log('[play] Using play-dl with custom agent for:', url);
    
    try {
        // Set custom options for play-dl
        playdl.setToken({
            useragent: ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36']
        });

        const stream = await playdl.stream(url, {
            quality: 2, // High quality
        });
        
        console.log('[play] play-dl stream created successfully');
        return { stream: stream.stream, type: stream.type };
    } catch (err) {
        console.error('[play] play-dl failed:', err);
        throw err;
    }
}
