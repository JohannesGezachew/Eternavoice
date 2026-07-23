import { ImageResponse } from "next/og";

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#0d0b09",
          color: "#f5efe6",
          padding: 72,
          fontFamily: "serif",
        }}
      >
        <div style={{ fontSize: 28, letterSpacing: 2, color: "#c7a27c" }}>
          EternaVoice
        </div>
        <div style={{ maxWidth: 820, display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              fontSize: 82,
              lineHeight: 0.98,
            }}
          >
            <div>Preserve a voice.</div>
            <div>Continue the conversation.</div>
          </div>
          <div style={{ marginTop: 36, fontSize: 30, lineHeight: 1.35, color: "#c9c0b5" }}>
            Recreate a voice from a recording, preview it, and speak with them again.
          </div>
        </div>
        <div style={{ fontSize: 22, color: "#8f877d" }}>eternavoice.com</div>
      </div>
    ),
    size,
  );
}
