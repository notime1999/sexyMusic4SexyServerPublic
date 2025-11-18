// Stubs to avoid requiring googleapis/types during build. Implement real YouTube API calls later.
export const searchVideos = async (query: string) => {
    return []; // placeholder
};

export const getVideoDetails = async (videoId: string) => {
    return null; // placeholder
};

export async function searchYouTube(query: string): Promise<{ url?: string; title?: string } | null> {
    return null;
}