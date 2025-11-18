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

async function checkCookiesFile(channel: any) {
    // Cerca prima in ./cookies.txt, poi in /app/cookies.txt
    let cookiePath = './cookies.txt';
    try {
        await fsPromises.access(cookiePath).catch(async () => {
            cookiePath = '/app/cookies.txt';
            await fsPromises.access(cookiePath);
        });
        const cookies = await fsPromises.readFile(cookiePath, 'utf-8');
        if (!cookies.trim() || cookies.includes('404') || cookies.includes('<html')) {
            await channel.send('⚠️ I cookie sono scaduti, non validi o il file non è quello giusto! Aggiorna cookies.txt.');
            return false;
        }
        return true;
    } catch (err) {
        await channel.send('⚠️ Errore nel leggere cookies.txt!');
        return false;
    }
}

export const execute = async (interaction: ChatInputCommandInteraction, args: string[] = []) => {
    await interaction.deferReply();
    setTimeout(() => {
        interaction.deleteReply().catch(() => { });
    }, 60000);
    console.log("ESEGUO PLAY", Date.now(), interaction.id, interaction.commandName, args);
    let query = args.join(' ').trim();

    const ytPlaylistMatch = query.match(/[?&]list=([A-Za-z0-9_-]+)/);
    const playlistId = ytPlaylistMatch ? ytPlaylistMatch[1] : null;
    const isYouTubePlaylist = /youtube\.com\/.*[?&]list=/.test(query) || /youtu\.be\/.*[?&]list=/.test(query);
    const isSpotifyPlaylist = /open\.spotify\.com\/.*playlist/.test(query) || /spotify:playlist:/.test(query);

    if (playlistId && playlistId.startsWith('RD')) {
        // È una Mix, NON una playlist standard: riproduci solo il primo video
        const url = new URL(query);
        url.searchParams.delete('list');
        url.searchParams.delete('start_radio');
        url.searchParams.delete('rv');
        query = url.toString();
        return interaction.reply('⚠️ Le playlist Mix di YouTube non sono supportate come playlist. Per la gestione completa delle playlist, usa un link con `list=PL...` nell\'URL.');
    }

    if (playlistId && !playlistId.startsWith('PL')) {
        // Non è una playlist standard
        return interaction.reply('⚠️ Per la gestione completa delle playlist YouTube, usa un link con `list=PL...` nell\'URL.');
    }

    if (!query) return interaction.reply('Please provide a song name or link.');

    // Detect Spotify playlist URL and enqueue all tracks
    try {
        console.log('[play] query=', query, 'isYouTubePlaylist=', isYouTubePlaylist, 'isSpotifyPlaylist=', isSpotifyPlaylist);

        let gp: GuildPlayer | undefined;

        if (isYouTubePlaylist) {
            // --- AGGIUNGI QUESTO BLOCCO PRIMA DI USARE gpYT ---
            const member = interaction.member as GuildMember;
            if (!member || !member.voice?.channel) {
                return interaction.reply('Devi essere in un canale vocale per riprodurre la musica.');
            }
            const voiceChannel = member.voice.channel;
            gp = GuildPlayer.get(voiceChannel.guild.id) || GuildPlayer.create(voiceChannel.guild.id, voiceChannel);
            // Dopo aver ottenuto gp:
            if (!gp.startedBy) {
                gp.startedBy = interaction.member?.user?.username || interaction.user.username;
            }
            // --- FINE BLOCCO ---

            // Verifica cookies.txt PRIMA di procedere
            const cookiesOk = await checkCookiesFile(interaction.channel);
            if (!cookiesOk) {
                return interaction.editReply('⚠️ Cookie file non valido o mancante. Impossibile riprodurre la playlist YouTube.');
            }

            const playlistId = await ytpl.getPlaylistID(query);
            console.log('[play] playlistId=', playlistId);

            const TIMEOUT_MS = 60000; // 60 secondi

            async function withTimeout(promise: Promise<any>, ms: number) {
                return Promise.race([
                    promise,
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), ms))
                ]);
            }

            // Esempio di uso:
            try {
                // Sostituisci una chiamata lunga, tipo:
                // const playlist = await ytpl(playlistId, { pages: Infinity });
                const playlist = await withTimeout(ytpl(playlistId, { pages: 1 }), TIMEOUT_MS);
                console.log('[play] playlist items:', playlist.items?.length);
                console.log('[DEBUG] Playlist items:', playlist.items.map((i: any) => ({ title: i.title, id: i.id, url: i.shortUrl })));

                const realItems = playlist.items.filter((item: any) => !!item.url);
                const skippedItems = playlist.items.filter((item: any) => !item.url);

                if (skippedItems.length > 0) {
                    console.warn('[play] Skipped playlist items:', skippedItems.map((i: any) => ({
                        title: i.title,
                        url: i.url,
                        id: i.id,
                        shortUrl: i.shortUrl
                    })));
                }

                if (realItems.length === 0) {
                    return interaction.reply('Nessun brano valido trovato nella playlist.');
                }
                // gp.queue = [];
                for (const item of realItems) {
                    gp.enqueue({
                        url: item.url || item.shortUrl,
                        title: item.title ?? item.url,
                        requestedBy: interaction.user.tag,
                        source: 'YouTube'
                    }, false); // PATCH: false per non avviare subito
                }
                gp.playNext().catch((e: any) => console.error('[GuildPlayer] playNext error', e)); // PATCH: avvia solo una volta dopo
                setTimeout(() => {
                    console.log('[DEBUG] queue after playNext:', gp!.queue.length, gp!.queue.map((t: any) => t.title));
                }, 2000);
                const nowPlaying = gp.getCurrent();
                const maxQueueToShow = 10;
                const more = gp.queue.length > maxQueueToShow ? `\n...e altri ${gp.queue.length - maxQueueToShow} brani` : '';
                let queueStr = buildQueueList(gp.queue.slice(0, maxQueueToShow)) + more;
                if (!queueStr.trim()) queueStr = 'Nessuna traccia in coda.';
                if (queueStr.length > 1024) queueStr = queueStr.slice(0, 1021) + '...';

                const requester = interaction.member?.user?.username || interaction.user.username;

                const startedBy = gp.startedBy || 'Sconosciuto';

                const embed = new EmbedBuilder()
                    .setTitle('Coda musicale')
                    .addFields(
                        { name: 'Now playing', value: nowPlaying?.title ?? 'Niente' },
                        { name: 'Queue', value: queueStr },
                        { name: 'Avviato da', value: startedBy, inline: true }
                    );

                const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                    new ButtonBuilder().setCustomId('shuffle').setLabel('Shuffle').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId('skip').setLabel('Skip').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('stop').setLabel('Stop').setStyle(ButtonStyle.Danger)
                );

                await interaction.editReply({ embeds: [embed], components: [row] });
                return;
            } catch (err) {
                console.error('[play] Playlist catch error:', err);
                await interaction.editReply('❌ Errore o timeout durante il caricamento della playlist.');
                return;
            }
        }

        if (isSpotifyPlaylist) {
            // ensure user is in voice channel
            const member = interaction.member as GuildMember;
            if (!member || !member.voice?.channel) {
                return interaction.reply('Devi essere in un canale vocale per riprodurre la musica.');
            }
            const voiceChannel = member.voice.channel;
            gp = GuildPlayer.get(voiceChannel.guild.id) || GuildPlayer.create(voiceChannel.guild.id, voiceChannel);
            // Dopo aver ottenuto gp:
            if (!gp.startedBy) {
                gp.startedBy = interaction.member?.user?.username || interaction.user.username;
            }
            const playlistId = extractSpotifyPlaylistId(query);
            let tracks: { name: string; artists: string[] }[] = [];
            try {
                tracks = await getPlaylistTracks(query);
            } catch (err) {
                console.error('[Spotify] getPlaylistTracks error:', err);
                return interaction.reply('Errore nel recupero della playlist Spotify.');
            }
            console.log('[play] getPlaylistTracks returned', tracks.length, 'tracks');
            if (!tracks || tracks.length === 0) {
                return interaction.reply('Playlist Spotify trovata ma vuota o non accessibile.');
            }

            const windowSize = 10;

            const tracksToEnqueue: any[] = [];
            const urlsSet = new Set<string>();
            const titlesSet = new Set<string>();
            let found = 0;
            let i = 0;
            while (found < windowSize && i < tracks.length) {
                const t = tracks[i];
                // Migliora la query aggiungendo artisti e "spotify"
                const query = `${t.name} ${t.artists.join(' ')} official audio spotify`;
                let info = await searchSpotifyYT(query) || await searchYouTubeService(query);
                if (!info) {
                    const r = await yts(query);
                    const v = r?.videos?.[0];
                    if (v) info = { url: v.url, title: v.title };
                }
                console.log(`[Spotify] Query: ${query} -> ${info?.url}`);
                // Evita duplicati sia per URL che per titolo
                if (
                    info &&
                    info.url &&
                    !urlsSet.has(info.url) &&
                    info.title &&
                    !titlesSet.has(info.title)
                ) {
                    tracksToEnqueue.push({
                        url: info.url,
                        title: info.title ?? t.name,
                        spotifyPlaylistId: playlistId ?? undefined,
                        spotifyIndex: i,
                        spotifyName: t.name,
                        spotifyArtists: t.artists,
                        requestedBy: interaction.user.tag,
                        source: 'Spotify'
                    }, false);
                    urlsSet.add(info.url);
                    titlesSet.add(info.title ?? '');
                    found++;
                } else if (!info?.url) {
                    console.warn(`[Spotify] Nessun risultato valido per: ${query}`);
                }
                i++;
            }
            if (tracksToEnqueue.length === 0) {
                return interaction.reply('Nessuna traccia trovata su YouTube per questa playlist Spotify.');
            }

            // PATCH: aggiungi tutte le tracce SOLO con enqueue, non azzerare la queue!
            for (const track of tracksToEnqueue) {
                // Check for duplicates by URL or title
                const alreadyInQueue = gp.queue.some(
                    t => t.url === track.url || t.title === track.title
                );
                if (!alreadyInQueue) {
                    gp.enqueue(track, false);
                }
            }
            // PATCH: avvia solo se non c'è già una traccia in riproduzione
            if (!gp.getCurrent()) {
                gp.playNext().catch(e => console.error('[GuildPlayer] playNext error', e));
            }

            // Salva i dati della playlist e il puntatore per il rolling window
            gp._playlistTracks = tracks;
            gp._playlistPointer = windowSize;
            gp._playlistId = playlistId ?? undefined;
            gp._lastRequester = interaction.user.tag;

            console.log('[Spotify] Queue finale:', gp.queue.map(t => ({
                spotifyIndex: t.spotifyIndex,
                title: t.title,
                url: t.url
            })));
            console.log('[Spotify] Prima traccia in coda:', gp.queue[0]);

            if (tracksToEnqueue.length === 0) {
                return interaction.reply('Nessuna traccia trovata su YouTube per questa playlist Spotify.');
            }

            const nowPlaying = gp.getCurrent();
            const maxQueueToShow = 10;
            const more = gp.queue.length > maxQueueToShow ? `\n...e altri ${gp.queue.length - maxQueueToShow} brani` : '';
            let queueStr = buildQueueList(gp.queue.slice(0, maxQueueToShow)) + more;
            if (!queueStr.trim()) queueStr = 'Nessuna traccia in coda.';
            if (queueStr.length > 1024) queueStr = queueStr.slice(0, 1021) + '...';


            const requester = interaction.member?.user?.username || interaction.user.username;

            const embed = new EmbedBuilder()
                .setTitle('Coda musicale')
                .addFields(
                    { name: 'Now playing', value: nowPlaying?.title ?? 'Niente' },
                    { name: 'Queue', value: queueStr },
                    { name: 'Richiesto da', value: requester, inline: true }
                );


            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder().setCustomId('shuffle').setLabel('Shuffle').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('skip').setLabel('Skip').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('stop').setLabel('Stop').setStyle(ButtonStyle.Danger)
            );

            await interaction.editReply({ embeds: [embed], components: [row] });
            return;
        }
    } catch (err) {
        console.error('[play] Playlist handling error:', err);
        // continue to single-search fallback
    }

    // Try Spotify search (if implemented)
    let songInfo: { url?: string; title?: string } | null = null;
    songInfo = await searchSpotify(query);
    if (!songInfo) {
        // fallback to youtube search via service or local yt-search
        songInfo = await searchSpotifyYT(query) || await searchYouTubeService(query);

        if (!songInfo) {
            // as a last fallback, use yt-search directly here
            const r = await yts(query);
            const v = r.videos?.[0];
            if (v) songInfo = { url: v.url, title: v.title };
        }
    }

    if (!songInfo || !songInfo.url) {
        return interaction.reply('Could not find any results for your query.');
    }

    // ensure user is in voice channel
    const member = interaction.member as GuildMember;
    if (!member || !member.voice?.channel) {
        return interaction.reply('Devi essere in un canale vocale per riprodurre la musica.');
    }

    const voiceChannel = member.voice.channel;

    // Instead of creating a new player/connection, use GuildPlayer:
    const gp = GuildPlayer.get(voiceChannel.guild.id) || GuildPlayer.create(voiceChannel.guild.id, voiceChannel);
    if (!gp.startedBy) {
        gp.startedBy = interaction.member?.user?.username || interaction.user.username;
    }
    gp.enqueue({
        url: songInfo.url,
        title: songInfo.title ?? songInfo.url,
        requestedBy: interaction.user.tag,
        source: isSpotifyPlaylist ? 'Spotify' : 'YouTube'
    });

    const nowPlaying = gp.getCurrent();
    const queueList = buildQueueList(gp.queue);

    const embed = new EmbedBuilder()
        .setTitle('Coda musicale')
        .addFields(
            { name: 'Now playing', value: nowPlaying?.title ?? 'Niente' },
            { name: 'Queue', value: queueList }
        );

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('shuffle').setLabel('Shuffle').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('skip').setLabel('Skip').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('stop').setLabel('Stop').setStyle(ButtonStyle.Danger)
    );

    await interaction.editReply({ embeds: [embed], components: [row] });
};

// utility function to get playdl stream (video or playlist)
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

        // yt_validate is synchronous (returns 'video'|'playlist'|'search'|false)
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
                    console.warn('[play] playdl.stream(video) failed, will fallback to ytdl:', err);
                    // fallback to ytdl-core
                    return await streamWithYtDlp(videoUrl);
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
                    console.warn('[play] playdl.stream(playlist first) failed, fallback to ytdl:', err);
                    return await streamWithYtDlp(firstUrl);
                }
            }
        }

        // try playdl.search with safe try/catch
        let results: any[] = [];
        try { results = (await playdl.search(url)) as any[]; } catch (e) { results = []; }
        if (results && results.length > 0) {
            const candidateUrl = results[0].url ?? results[0].link ?? results[0].shortUrl;
            if (candidateUrl && /^https?:\/\//i.test(candidateUrl)) {
                console.log('[play] search candidateUrl=', candidateUrl);
                try {
                    return await playdl.stream(candidateUrl);
                } catch (err) {
                    console.warn('[play] playdl.stream(search candidate) failed, fallback to ytdl:', err);
                    return await streamWithYtDlp(candidateUrl);
                }
            }
        }

        // final fallback: use yt-search
        try {
            const r = await yts(url);
            const v = r?.videos?.[0];
            if (v?.url && /^https?:\/\//i.test(v.url)) {
                console.log('[play] yts fallback url=', v.url);
                try {
                    return await playdl.stream(v.url);
                } catch (err) {
                    console.warn('[play] playdl.stream(yts) failed, fallback to ytdl:', err);
                    return await streamWithYtDlp(v.url);
                }
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

// replace streamWithYtDlp implementation with the spawn-based version below
export async function streamWithYtDlp(url: string) {
    // Fallback yt-dlp
    let bin = 'yt-dlp';
    if (process.platform === 'win32') {
        // Cerca yt-dlp.exe locale
        const localBin = path.join(__dirname, '..', '..', 'node_modules', '.bin', 'yt-dlp.exe');
        try {
            require('fs').accessSync(localBin);
            bin = localBin;
        } catch {
            bin = 'yt-dlp.exe'; // fallback: PATH globale
        }
    }
    console.log('[play] using yt-dlp binary (spawn):', bin);

    // Cambia qui: usa ./cookies.txt invece di /app/cookies.txt
    const cookiePath = path.resolve('./cookies.txt');

    const args = [
        '--cookies', cookiePath,
        '-f', 'bestaudio/best',
        '-o', '-', // stdout
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
        // try regex fallback
        const m = url.match(/playlist\/([A-Za-z0-9_-]+)/);
        if (m && m[1]) return m[1];
    }
    return null;
}

export function buildQueueList(queue: any[]) {
    if (!queue || queue.length === 0) return 'Nessuna traccia in coda.';
    return queue.map((t, i) => {
        let label = '';
        if (t.source === 'Spotify') label = '[Spotify]';
        else if (t.source === 'YouTube') label = '[YouTube]';
        return `${i + 1}. ${t.title} ${label} (${t.url})`;
    }).join('\n');
}

