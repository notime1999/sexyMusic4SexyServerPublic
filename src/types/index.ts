export interface Command {
    name: string;
    description: string;
    execute(message: any, args: string[]): Promise<void>;
}

export interface AudioPlayerState {
    isPlaying: boolean;
    currentTrack: string | null;
    queue: string[];
}

export interface SpotifyTrack {
    id: string;
    name: string;
    artist: string;
    album: string;
    duration: number;
}

export interface YouTubeVideo {
    id: string;
    title: string;
    channel: string;
    duration: number;
}