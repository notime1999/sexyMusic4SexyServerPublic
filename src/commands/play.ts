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
import ytdl from 'ytdl-core';
import StreamManager from '../audio/streamManager';
import { searchSpotify, searchYouTube as searchSpotifyYT, getPlaylistSummary } from '../services/spotify';
import { searchYouTube as searchYouTubeService } from '../services/youtube';
import ytpl from 'ytpl';
// @ts-ignore
import yts from 'yt-search';
import { spawn } from 'child_process';
import path from 'path';
import GuildPlayer from '../audio/guildPlayer';
import { ensureSpotifyToken } from '../services/spotify';
import spotifyApi from '../services/spotify';
import { getPlaylistTracks } from '../services/spotify';
import os from 'os';
import fs from 'fs';
import fsPromises from 'fs/promises';

const streamManager = new StreamManager();

(async () => {
    try {
        const cookiePath = fs.existsSync('./cookies.txt') ? './cookies.txt' : '/app/cookies.txt';
        if (fs.existsSync(cookiePath)) {
            const cookies = await fsPromises.readFile(cookiePath, 'utf-8');
            await playdl.setToken({
                youtube: {
                    cookie: cookies
                }
            });
            console.log('[play-dl] YouTube cookies loaded');
        } else {
            console.warn('[play-dl] No cookies.txt found, will use fallback methods');
        }
    } catch (e) {
        console.error('[play-dl] Cookie init failed:', e);
    }
})();

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
    await interaction.deferReply();
    let replyUpdated = false;

    setTimeout(async () => {
        if (!replyUpdated) {
            try {
                await interaction.deleteReply();
            } catch { }
        }
    }, 60000);

    console.log("EXECUTING PLAY", Date.now(), interaction.id, interaction.commandName, args);
    let query = args.join(' ').trim();

    const ytPlaylistMatch = query.match(/[?&]list=([A-Za-z0-9_-]+)/);
    const playlistId = ytPlaylistMatch ? ytPlaylistMatch[1] : null;
    const isYouTubePlaylist = query.includes('youtube.com/playlist') || (query.includes('youtube.com/watch') && query.includes('&list='));
    const isSpotifyPlaylist = query.includes('open.spotify.com/playlist');

    console.log('[play] query=', query, 'isYouTubePlaylist=', isYouTubePlaylist, 'isSpotifyPlaylist=', isSpotifyPlaylist);

    if (isYouTubePlaylist) {
        let playlistId: string | null = null;

        const playlistMatch = query.match(/[?&]list=([^&]+)/);
        if (playlistMatch) {
            playlistId = playlistMatch[1];
        }

        if (!playlistId) {
            return interaction.editReply('Cannot extract YouTube playlist ID.');
        }

        console.log('[play] YouTube playlist ID:', playlistId);

        try {
            const member = interaction.member as GuildMember;
            if (!member || !member.voice?.channel) {
                return interaction.reply('You must be in a voice channel to play music.');
            }
            const voiceChannel = member.voice.channel;
            const gp = GuildPlayer.get(voiceChannel.guild.id) || GuildPlayer.create(voiceChannel.guild.id, voiceChannel);
            if (!gp.startedBy) {
                gp.startedBy = interaction.member?.user?.username || interaction.user.username;
            }

            const playlist = await playdl.playlist_info(`https://www.youtube.com/playlist?list=${playlistId}`, { incomplete: true });
            const videos = await playlist.all_videos();

            console.log('[play] Found', videos.length, 'videos in YouTube playlist');

            for (const video of videos) {
                const videoId = video.url?.match(/[?&]v=([^&]+)/)?.[1];
                const thumbnail = videoId ? `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg` : undefined;
                
                gp.enqueue({
                    url: video.url,
                    title: video.title ?? 'Unknown',
                    requestedBy: interaction.user.username,
                    source: 'YouTube',
                    thumbnail
                }, false); 
            }

            if (!gp.getCurrent()) {
                await gp.playNext();
            }

            await gp.deleteQueueMessage(interaction.client);

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

            await interaction.editReply({ embeds: [embed], components: [row] });
            replyUpdated = true;
            const sent = await interaction.fetchReply();
            gp.queueMessageId = sent.id;
            gp.queueChannelId = sent.channelId;
            return;
        } catch (e) {
            console.error('[play] YouTube playlist error:', e);
            return interaction.editReply('Error loading YouTube playlist.');
        }
    }

    if (isSpotifyPlaylist) {
        const member = interaction.member as GuildMember;
        if (!member || !member.voice?.channel) {
            return interaction.reply('You must be in a voice channel to play music.');
        }
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

    const member = interaction.member as GuildMember;
    if (!member || !member.voice?.channel) {
        return interaction.editReply('You must be in a voice channel to play music.');
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

export async function getPlaydlStream(url: string) {
    try {
        const isHttp = typeof url === 'string' && /^https?:\/\//i.test(url);
        if (isHttp) {
            console.log('[play] getPlaydlStream: trying direct url:', url);
            try {
                const s = await playdl.stream(url);
                console.log('[play] direct stream OK, type=', (s as any)?.type);
                return s;
            } catch (err) {
                console.warn('[play] direct playdl.stream failed, will try other fallbacks:', err);
            }
        }

        const valid = playdl.yt_validate(url);

        if (valid === 'video') {
            let info: any = null;
            try { info = await playdl.video_info(url); } catch (e) { info = null; }
            const videoUrl = info?.video_details?.url ?? url;
            if (videoUrl && /^https?:\/\//i.test(videoUrl)) {
                console.log('[play] video_info url=', videoUrl);
                try {
                    return await playdl.stream(videoUrl);
                } catch (err) {
                    console.warn('[play] playdl.stream(video) failed, will fallback to yts:', err);
                    const r = await yts({ videoId: videoUrl.match(/[?&]v=([^&]+)/)?.[1] });
                    if (r?.videos?.[0]?.url) {
                        return await playdl.stream(r.videos[0].url);
                    }
                    throw err;
                }
            }
        }

        if (valid === 'playlist') {
            let pl: any = null;
            try { pl = await playdl.playlist_info(url); } catch (e) { pl = null; }
            const first = (pl as any)?.videos?.[0];
            const firstUrl = first?.url ?? first?.link ?? first?.shortUrl;
            if (firstUrl && /^https?:\/\//i.test(firstUrl)) {
                console.log('[play] playlist firstUrl=', firstUrl);
                try {
                    return await playdl.stream(firstUrl);
                } catch (err) {
                    console.warn('[play] playdl.stream(playlist first) failed, fallback to yts:', err);
                    const r = await yts({ videoId: firstUrl.match(/[?&]v=([^&]+)/)?.[1] });
                    if (r?.videos?.[0]?.url) {
                        return await playdl.stream(r.videos[0].url);
                    }
                    throw err;
                }
            }
        }

        let results: any[] = [];
        try { results = (await playdl.search(url)) as any[]; } catch (e) { results = []; }
        if (results && results.length > 0) {
            const candidateUrl = results[0].url ?? results[0].link ?? results[0].shortUrl;
            if (candidateUrl && /^https?:\/\//i.test(candidateUrl)) {
                console.log('[play] search candidateUrl=', candidateUrl);
                try {
                    return await playdl.stream(candidateUrl);
                } catch (err) {
                    console.warn('[play] playdl.stream(search candidate) failed, fallback to yts:', err);
                    const r = await yts(url);
                    const v = r?.videos?.[0];
                    if (v?.url) {
                        return await playdl.stream(v.url);
                    }
                    throw err;
                }
            }
        }

        try {
            const r = await yts(url);
            const v = r?.videos?.[0];
            if (v?.url && /^https?:\/\//i.test(v.url)) {
                console.log('[play] yts fallback url=', v.url);
                return await playdl.stream(v.url);
            }
        } catch (e) {
            /* ignore */
        }

        throw new Error('No playable URL found');
    } catch (err) {
        console.error('getPlaydlStream error for:', url, err);
        throw err;
    }
}

export async function streamWithYtDlp(url: string) {
    let bin = 'yt-dlp';
    if (process.platform === 'win32') {
        const localBin = path.join(__dirname, '..', '..', 'node_modules', '.bin', 'yt-dlp.exe');
        try {
            require('fs').accessSync(localBin);
            bin = localBin;
        } catch {
            bin = 'yt-dlp.exe';
        }
    }
    console.log('[play] using yt-dlp binary (spawn):', bin);

    const cookiePath = path.resolve('./cookies.txt');

    const args = [
        '--cookies', cookiePath,
        '-f', 'bestaudio/best',
        '-o', '-',
        '--no-playlist',
        '--extractor-args', 'youtube:player_client=default',
        url,
    ];

    const proc = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });

    proc.stderr?.on('data', (d: Buffer) => console.warn('[yt-dlp]', d.toString().trim()));
    proc.on('error', (err: any) => console.error('[yt-dlp] spawn error:', err));
    proc.on('close', (code: number) => console.log('[yt-dlp] closed with code', code));

    return { stream: proc.stdout, type: 'unknown' as const };
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
        const urlDisplay = (t.url && !t.url.startsWith('spotify:')) ? ` (${t.url})` : '';
        const sourceTag = t.source ? ` [${t.source}]` : '';
        return `${i + 1}. ${t.title}${sourceTag}${urlDisplay}`;
    }).join('\n');
}

