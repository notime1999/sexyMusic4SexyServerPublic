import { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayer, AudioPlayerStatus, NoSubscriberBehavior, entersState, VoiceConnection, VoiceConnectionStatus, createAudioResource as createRes, StreamType, AudioResource } from '@discordjs/voice';
import playdl from 'play-dl';
import { VoiceBasedChannel, Client } from 'discord.js';
import { getPlaylistTrackAt } from '../services/spotify';
import { searchYouTube as searchSpotifyYT } from '../services/spotify';
import { searchYouTube as searchYouTubeService } from '../services/youtube';
import yts from 'yt-search';
import path from 'path';
import { spawn } from 'child_process';
import { Readable } from 'stream';

export interface Track {
    url: string;
    title: string;
    requestedBy?: string;
    spotifyPlaylistId?: string;
    spotifyIndex?: number;
    spotifyName?: string;
    spotifyArtists?: string[];
    spotifyId?: string;
    source?: 'Spotify' | 'YouTube';
    thumbnail?: string;
}

export default class GuildPlayer {
    private static players = new Map<string, GuildPlayer>();

    public queue: Track[] = [];
    private connection: VoiceConnection | null = null;
    private player: AudioPlayer | null = null;
    private guildId: string;
    private playing = false;
    private currentTrack: Track | null = null;
    private voiceChannel: VoiceBasedChannel | null = null;

    public getCurrentTrack() {
        return this.currentTrack;
    }

    public _playlistTracks?: any[];
    public _playlistPointer?: number;
    public _playlistId?: string;
    public _lastRequester?: string;
    public startedBy?: string;
    public lastAction?: string;

    private inactivityTimer: NodeJS.Timeout | null = null;
    private static readonly INACTIVITY_TIMEOUT = 5 * 60 * 1000;

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
        gp.voiceChannel = voiceChannel;
        gp.stopped = false;
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
            });
            this.player.on(AudioPlayerStatus.Idle, () => {
                this.playNext().catch(() => { });
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
                console.log(`[GuildPlayer] guild=${this.guildId} Disconnected due to inactivity`);
            }, GuildPlayer.INACTIVITY_TIMEOUT);
        }
    }

    private clearInactivityTimer() {
        if (this.inactivityTimer) {
            clearTimeout(this.inactivityTimer);
            this.inactivityTimer = null;
        }
    }

    private stopped = false;

    async stop() {
        this.stopped = true;
        try {
            if (this.player) {
                this.player.stop(true);
            }
            if (this.connection) {
                this.connection.destroy();
                this.connection = null;
            }
        } catch { }
        this.queue = [];
        this._playlistPointer = 0;
        this._playlistTracks = [];
        this.lastAction = undefined;
        this.playing = false;
        this.currentTrack = null;
        this.clearInactivityTimer();
    }

    async playNext() {
        if (!this.ensureVoiceConnection()) {
            console.error('[GuildPlayer] Cannot play: not connected to voice channel');
            return;
        }

        if (!this.player) {
            console.error('[GuildPlayer] Player is not initialized');
            return;
        }

        if (this.queue.length === 0) {
            console.log('[GuildPlayer] Queue is empty');
            this.currentTrack = null;
            this.setPlaying(false);
            return;
        }

        const track = this.queue.shift()!;
        this.currentTrack = track;
        console.log('[GuildPlayer] guild=' + this.guildId + ' playing next:', track.title);
        console.log('[GuildPlayer] Track URL:', track.url); // DEBUG LOG

        // VALIDATE URL
        if (!track.url || track.url === 'undefined' || track.url.startsWith('spotify:')) {
            console.error('[GuildPlayer] Invalid or missing URL for track:', track);
            await this.playNext();
            return;
        }

        let resource: AudioResource | null = null;

        if (track.source === 'Spotify' && track.spotifyName && track.spotifyArtists) {
            console.log('[GuildPlayer] Spotify track detected, searching on YouTube...');
            
            const yts = (await import('yt-search')).default;
            const query = `${track.spotifyName} ${track.spotifyArtists.join(' ')} official audio`;
            let info = null;
            
            try {
                const r = await yts(query);
                const v = r?.videos?.[0];
                if (v) info = { url: v.url, title: v.title };
            } catch (e) {
                console.error('[GuildPlayer] Failed to find YouTube URL for Spotify track:', e);
            }
            
            if (info && info.url) {
                track.url = info.url;
                console.log('[GuildPlayer] Found YouTube URL:', info.url);
            } else {
                console.error('[GuildPlayer] Could not find YouTube URL for:', track.title);
                await this.playNext();
                return;
            }
        }

        // VALIDATE URL AGAIN AFTER SPOTIFY SEARCH
        if (!track.url || track.url === 'undefined' || track.url.startsWith('spotify:')) {
            console.error('[GuildPlayer] Still invalid URL after processing:', track.url);
            await this.playNext();
            return;
        }

        try {
            // Use youtube-dl-exec - MOST RELIABLE
            console.log('[GuildPlayer] Calling streamWithYoutubeDl with URL:', track.url);
            const { streamWithYoutubeDl } = await import('../commands/play');
            const streamResult = await streamWithYoutubeDl(track.url);
            
            if (!streamResult.stream) {
                throw new Error('Stream is null or undefined');
            }
            
            resource = createAudioResource(streamResult.stream, {
                inputType: StreamType.Arbitrary,
                inlineVolume: true
            });
            
            if (resource.volume) {
                resource.volume.setVolume(0.5);
            }
            
            console.log('[GuildPlayer] Created audio resource from youtube-dl-exec');
        } catch (err) {
            console.error('[GuildPlayer] youtube-dl-exec failed:', err);
            await this.playNext();
            return;
        }

        if (!resource) {
            console.error('[GuildPlayer] Failed to create audio resource');
            await this.playNext();
            return;
        }

        this.player.play(resource);
        this.setPlaying(true);

        this.player.once(AudioPlayerStatus.Idle, async () => {
            console.log('[GuildPlayer] Track ended, playing next...');
            await this.playNext();
        });
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

    getQueue() {
        return this.queue.filter(t => !!t.url && !!t.title && t.title !== 'undefined');
    }

    getCurrent() {
        return this.currentTrack;
    }

    public setPlaying(value: boolean) {
        this.playing = value;
    }

    async shuffleQueue(forceSimple = false) {
        if (!this.ensureVoiceConnection()) {
            console.error('[GuildPlayer] Cannot shuffle: not connected to voice channel');
            return;
        }

        if (!forceSimple && this._playlistTracks && Array.isArray(this._playlistTracks) && this._playlistTracks.length > 0) {
            console.log('[GuildPlayer] Shuffling entire Spotify playlist:', this._playlistTracks.length, 'tracks');

            for (let i = this._playlistTracks.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [this._playlistTracks[i], this._playlistTracks[j]] = [this._playlistTracks[j], this._playlistTracks[i]];
            }

            console.log('[GuildPlayer] Playlist shuffled. First 3 tracks:',
                this._playlistTracks.slice(0, 3).map(t => `${t.name} - ${t.artists.join(', ')}`));

            this.queue = [];
            this._playlistPointer = 0;

            const MAX_TRACKS = 10;
            const tracksToEnqueue: any[] = [];

            for (let i = 0; i < this._playlistTracks.length && tracksToEnqueue.length < MAX_TRACKS; i++) {
                const t = this._playlistTracks[i];
                console.log(`[GuildPlayer] Adding track ${tracksToEnqueue.length + 1}/${MAX_TRACKS}: ${t.name} - ${t.artists.join(', ')}`);

                tracksToEnqueue.push({
                    url: t.url || `spotify:track:${t.id}`,
                    title: `${t.name} - ${t.artists.join(', ')}`,
                    spotifyPlaylistId: this._playlistId,
                    spotifyIndex: i,
                    spotifyName: t.name,
                    spotifyArtists: t.artists,
                    spotifyId: t.id,
                    requestedBy: this._lastRequester,
                    source: 'Spotify',
                    thumbnail: t.album?.images?.[0]?.url
                });

                this._playlistPointer = i + 1;
            }

            for (const track of tracksToEnqueue) {
                this.enqueue(track, false);
            }

            console.log('[GuildPlayer] Shuffled playlist, loaded', tracksToEnqueue.length, 'tracks instantly. Current track continues playing.');
        } else {
            console.log('[GuildPlayer] Shuffling current queue:', this.queue.length, 'tracks');

            for (let i = this.queue.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [this.queue[i], this.queue[j]] = [this.queue[j], this.queue[i]];
            }

            console.log('[GuildPlayer] Queue shuffled. Current track continues playing.');
        }
    }

    public queueMessageId?: string;
    public queueChannelId?: string;

    public async deleteQueueMessage(client: Client) {
        if (this.queueMessageId && this.queueChannelId) {
            try {
                const channel = await client.channels.fetch(this.queueChannelId);
                if (channel && channel.isTextBased()) {
                    const msg = await channel.messages.fetch(this.queueMessageId);
                    await msg.delete();
                }
            } catch { }
            this.queueMessageId = undefined;
            this.queueChannelId = undefined;
        }
    }

    public resetQueue() {
        this.queue = [];
        this.currentTrack = null;
        if (this.player) {
            this.player.stop(true);
        }
    }

    public ensureVoiceConnection(): boolean {
        if (!this.voiceChannel) {
            console.log('[GuildPlayer] No voice channel set');
            return false;
        }

        const currentState = this.connection?.state.status;

        if (!this.connection ||
            currentState === VoiceConnectionStatus.Disconnected ||
            currentState === VoiceConnectionStatus.Destroyed) {

            console.log('[GuildPlayer] Reconnecting to voice channel:', this.voiceChannel.name);

            try {
                this.connection = joinVoiceChannel({
                    channelId: this.voiceChannel.id,
                    guildId: this.voiceChannel.guild.id,
                    adapterCreator: this.voiceChannel.guild.voiceAdapterCreator as any,
                });

                this.connection.on(VoiceConnectionStatus.Disconnected, async () => {
                    console.log('[GuildPlayer] Voice connection disconnected');
                    try {
                        await Promise.race([
                            entersState(this.connection!, VoiceConnectionStatus.Signalling, 5_000),
                            entersState(this.connection!, VoiceConnectionStatus.Connecting, 5_000),
                        ]);
                    } catch (error) {
                        console.log('[GuildPlayer] Voice connection destroyed after timeout');
                        this.connection?.destroy();
                    }
                });

                if (this.player) {
                    this.connection.subscribe(this.player);
                }
                return true;
            } catch (e) {
                console.error('[GuildPlayer] Failed to reconnect:', e);
                return false;
            }
        }

        return true;
    }
}

function shuffleArray<T>(array: T[]): T[] {
    const arr = array.slice();
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}
