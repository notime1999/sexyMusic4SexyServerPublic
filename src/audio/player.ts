export class AudioPlayer {
    public isPlaying: boolean;
    private currentTrack: any | null;

    constructor() {
        this.isPlaying = false;
        this.currentTrack = null;
    }

    play(track: any) {
        this.currentTrack = track;
        this.isPlaying = true;
        // implement real playback logic (Lavalink, @discordjs/voice, etc.)
        console.log('AudioPlayer.play:', track);
    }

    stop() {
        // stop playback logic
        this.isPlaying = false;
        this.currentTrack = null;
        console.log('AudioPlayer.stop');
    }

    getCurrentTrack() {
        return this.currentTrack;
    }
}