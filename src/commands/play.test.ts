import { streamWithWrapper } from "./play";

describe("play command", () => {
  test("streamWithWrapper should return a stream and title", async () => {
    console.log("🧪 Starting test...");
    const videoUrl = "https://www.youtube.com/watch?v=V0M8i0z17As";
    console.log("🎵 Testing with URL:", videoUrl);

    try {
      const result = await streamWithWrapper(videoUrl);
      console.log("✅ Result received:", {
        hasStream: !!result.stream,
        title: result.title,
        streamType: typeof result.stream
      });

      expect(result).toHaveProperty("stream");
      expect(result).toHaveProperty("title");
      expect(typeof result.title).toBe("string");

      console.log("🎉 Test passed!");
      return result.stream.destroy();
    } catch (error) {
      console.error("❌ Test failed with error:", error);
      throw error;
    }
  }, 30000);
});
