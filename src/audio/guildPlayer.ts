import { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayer, AudioPlayerStatus, NoSubscriberBehavior, entersState, VoiceConnection, VoiceConnectionStatus, createAudioResource as createRes, StreamType } from '@discordjs/voice';
import playdl from 'play-dl';
import ytdl from 'ytdl-core';
import { VoiceBasedChannel } from 'discord.js';
import { getPlaylistTrackAt } from '../services/spotify';
import { searchYouTube as searchYouTubeService } from '../services/youtube';
import { searchYouTube as searchSpotifyYT } from '../services/spotify';
import yts from 'yt-search';
import path from 'path';
import { spawn } from 'child_process';
import { getPlaydlStream, streamWithYtDlp } from '../commands/play';

type Track = {
    url?: string;
    title?: string;
    requestedBy?: string;
    spotifyName?: string;
    spotifyArtists?: string[];
    spotifyPlaylistId?: string;
    spotifyIndex?: number;
};

export default class GuildPlayer {
    private static players = new Map<string, GuildPlayer>();

    public queue: Track[] = [];
    private connection: VoiceConnection | null = null;
    private player: AudioPlayer | null = null;
    private guildId: string;
    private playing = false;
    private currentTrack: Track | null = null;

    public getCurrentTrack() {
        return this.currentTrack;
    }

    public _playlistTracks?: any[];
    public _playlistPointer?: number;
    public _playlistId?: string;
    public _lastRequester?: string;

    private inactivityTimer: NodeJS.Timeout | null = null;
    private static readonly INACTIVITY_TIMEOUT = 5 * 60 * 1000; // 5 minuti

    private constructor(guildId: string) {
        this.guildId = guildId;
    }

    static get(guildId: string) {
        return this.players.get(guildId) ?? null;
    }

    static create(guildId: string, voiceChannel: VoiceBasedChannel) {
        let gp = this.players.get(guildId);
        if (!gp) {
            gp = new GuildPlayer(guildId);
            this.players.set(guildId, gp);
        }
        gp.attachIfNeeded(voiceChannel);
        return gp;
    }

    private attachIfNeeded(voiceChannel: VoiceBasedChannel) {
        if (!this.connection) {
            this.connection = joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: voiceChannel.guild.id,
                adapterCreator: voiceChannel.guild.voiceAdapterCreator as unknown as any,
            });
        }
        if (!this.player) {
            this.player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Pause } });
            this.connection!.subscribe(this.player);
            this.player.on('stateChange', (_oldS, newS) => {
                // console.debug('player state', newS.status);
            });
            this.player.on(AudioPlayerStatus.Idle, () => {
                this.playNext().catch(() => {});
            });
            this.player.on('error', (e) => console.error('[GuildPlayer] player error', e));
        }
    }

    enqueue(track: Track, autoPlay = true) {
        if (!track.url) {
            console.warn('[GuildPlayer] Tried to enqueue a track without url, skipping:', track);
            return;
        }
        this.queue.push(track);
        console.log('[DEBUG] enqueue:', this.queue.length, this.queue.map(t => t.title));
        // if nothing playing, start
        if (autoPlay && !this.playing) {
            this.playNext().catch((e) => console.error('[GuildPlayer] playNext error', e));
        }
    }

    private resetInactivityTimer() {
        if (this.inactivityTimer) clearTimeout(this.inactivityTimer);
        if (this.connection) {
            this.inactivityTimer = setTimeout(() => {
                this.connection?.destroy();
                this.connection = null;
                this.player = null;
                this.playing = false;
                this.currentTrack = null;
                console.log(`[GuildPlayer] guild=${this.guildId} Disconnesso per inattività`);
            }, GuildPlayer.INACTIVITY_TIMEOUT);
        }
    }

    private clearInactivityTimer() {
        if (this.inactivityTimer) {
            clearTimeout(this.inactivityTimer);
            this.inactivityTimer = null;
        }
    }

    async playNext() {
        if (this.queue.length === 0) {
            this.currentTrack = null;
            this.playing = false;
            return;
        }
        const nextTrack = this.queue.shift();
        if (!nextTrack) {
            this.currentTrack = null;
            this.playing = false;
            return;
        }
        this.currentTrack = nextTrack;

        // Lazy resolve: se è un placeholder da playlist Spotify
        if (!nextTrack.url && typeof nextTrack.spotifyPlaylistId === 'string' && typeof nextTrack.spotifyIndex === 'number') {
            try {
                const meta = await getPlaylistTrackAt(nextTrack.spotifyPlaylistId, nextTrack.spotifyIndex);
                if (meta) {
                    nextTrack.spotifyName = meta.name;
                    nextTrack.spotifyArtists = meta.artists;
                    nextTrack.title = nextTrack.title ?? meta.name;
                } else {
                    console.warn(`[GuildPlayer] Could not fetch metadata for playlist ${nextTrack.spotifyPlaylistId} index=${nextTrack.spotifyIndex}, skipping`);
                    setImmediate(() => this.playNext().catch(e => console.error('[GuildPlayer] playNext error', e)));
                    return;
                }
            } catch (e) {
                console.error('[GuildPlayer] error fetching single track metadata', e);
                setImmediate(() => this.playNext().catch(err => console.error('[GuildPlayer] playNext error', err)));
                return;
            }
        }

        // Ora risolvi la traccia (se serve)
        if (!nextTrack.url && nextTrack.spotifyName) {
            const q = `${nextTrack.spotifyName} ${nextTrack.spotifyArtists?.join(' ') ?? ''}`.trim();
            console.log(`[GuildPlayer] resolving placeholder: ${q}`);
            let sInfo: { url?: string; title?: string } | null = null;
            try { sInfo = await searchSpotifyYT(q); } catch (e) { sInfo = null; }
            if (!sInfo || !sInfo.url) {
                try { sInfo = await searchYouTubeService(q); } catch (e) { sInfo = null; }
            }
            if (!sInfo || !sInfo.url) {
                try {
                    const r = await yts(q);
                    const v = r?.videos?.[0];
                    if (v) sInfo = { url: v.url, title: v.title };
                } catch (e) { /* ignore */ }
            }
            if (sInfo && sInfo.url) {
                nextTrack.url = sInfo.url;
                nextTrack.title = nextTrack.title ?? sInfo.title;
                console.log(`[GuildPlayer] placeholder resolved -> ${nextTrack.url}`);
            } else {
                console.warn(`[GuildPlayer] could not resolve placeholder: ${q} — skipping`);
                setImmediate(() => this.playNext().catch(err => console.error('[GuildPlayer] playNext error', err)));
                return;
            }
        } else if (!nextTrack.url) {
            // Se ancora non c'è url, salta
            console.warn(`[GuildPlayer] placeholder has no metadata to resolve, skipping`);
            setImmediate(() => this.playNext().catch(err => console.error('[GuildPlayer] playNext error', err)));
            return;
        }

        console.log(`[GuildPlayer] guild=${this.guildId} playing next: ${nextTrack.title ?? nextTrack.url}`);
        if (!this.connection || !this.player) {
            console.warn(`[GuildPlayer] guild=${this.guildId} no connection/player available`);
            return;
        }

        // get stream via playdl -> fallback ytdl-core
        let streamObj: any = null;
        if (!nextTrack.url) {
            console.error('[GuildPlayer] track.url is undefined, skipping track:', nextTrack);
            setImmediate(() => this.playNext().catch(e => console.error('[GuildPlayer] playNext error', e)));
            return;
        }
        try {
            const url = nextTrack.url!;
            // Usa SEMPRE la url originale per playdl.stream
            streamObj = await playdl.stream(url);
        } catch (err) {
            console.warn('[GuildPlayer] playdl.stream failed, will try yt-dlp fallback', err);
            try {
                // Fallback yt-dlp (usa la funzione già presente)
                streamObj = await streamWithYtDlp(nextTrack.url!);
            } catch (err2) {
                console.error('[GuildPlayer] all stream methods failed for', nextTrack.url, err2);
                this.playing = false;
                this.currentTrack = null;
                setImmediate(() => this.playNext().catch(e => console.error('[GuildPlayer] playNext error', e)));
                return;
            }
        }

        // create resource and play (existing code)
        let resource;
        try {
            resource = createRes(streamObj.stream, {
                inputType: streamObj.type === 'opus' ? StreamType.Opus : StreamType.Arbitrary,
                inlineVolume: true,
            });
        } catch (err) {
            console.error('[GuildPlayer] createAudioResource failed', err);
            this.currentTrack = null;
            setImmediate(() => this.playNext().catch(e => console.error('[GuildPlayer] playNext error', e)));
            return;
        }

        if (resource.volume) resource.volume.setVolume(0.8);

        this.player.play(resource);
        this.playing = true;

        // ensure connection ready
        try { await entersState(this.connection, VoiceConnectionStatus.Ready, 15_000); } catch (e) { console.warn('[GuildPlayer] connection ready timeout', e); }
        try { await entersState(this.player, AudioPlayerStatus.Playing, 5_000); } catch (e) { console.warn('[GuildPlayer] player playing timeout', e); }

        // Dopo aver tolto la traccia dalla queue:
        if (this._playlistTracks && typeof this._playlistPointer === 'number') {
            while (this.queue.length < 10 && this._playlistPointer < this._playlistTracks.length) {
                const t = this._playlistTracks[this._playlistPointer];
                const artists = Array.isArray(t.artists) ? t.artists : [];
                const query = `${t.name} ${artists.join(' ')}`;
                let info = await searchSpotifyYT(query) || await searchYouTubeService(query);
                if (!info?.url) {
                    // Skippa la traccia se non trovi una url valida
                    console.warn(`[GuildPlayer] Skipping playlist track: no url found for "${query}"`);
                    this._playlistPointer++;
                    continue;
                }
                // Solo se info.url è valida, enqueua la traccia!
                this.enqueue({
                    url: info.url,
                    title: info.title ?? t.name,
                    spotifyPlaylistId: this._playlistId,
                    spotifyIndex: this._playlistPointer,
                    spotifyName: t.name,
                    spotifyArtists: artists,
                    requestedBy: this._lastRequester
                });
                this._playlistPointer++;
            }
        }
    }

    skip(): Track | null | false {
        if (!this.player) return false;
        try {
            this.player.stop(true);
            return this.queue[0] ?? null;
        } catch (e) {
            console.error('[GuildPlayer] skip error', e);
            return false;
        }
    }

    stop() {
        // clear queue and destroy connection/player
        this.queue = [];
        this.currentTrack = null;
        try { this.player?.stop(true); } catch { }
        try { this.connection?.destroy(); } catch { }
        GuildPlayer.players.delete(this.guildId);
    }

    getQueue() {
        return this.queue.filter(t => !!t.url && !!t.title && t.title !== 'undefined');
    }

    getCurrent() {
        return this.currentTrack;
    }

    public setPlaying(value: boolean) {
        this.playing = value;
    }

    shuffleQueue() {
        // Mescola solo la queue, NON currentTrack!
        for (let i = this.queue.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.queue[i], this.queue[j]] = [this.queue[j], this.queue[i]];
        }
    }
}
