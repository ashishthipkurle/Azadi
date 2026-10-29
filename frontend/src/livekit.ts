// LiveKit runtime helper.
//
// We use the pure JS `livekit-client` SDK so publishing/subscribing works out
// of the box in the web preview via browser WebRTC. On a native dev-build the
// same code runs on top of `@livekit/react-native` + `@livekit/react-native-webrtc`.

import { Platform } from "react-native";
import type { Room as RoomType } from "livekit-client";

let cached: typeof import("livekit-client") | null = null;
let globalsRegistered = false;

export function ensureLiveKitGlobals() {
  if (Platform.OS !== "web" && !globalsRegistered) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { registerGlobals } = require("@livekit/react-native");
      if (typeof registerGlobals === "function") {
        registerGlobals();
        globalsRegistered = true;
      }
    } catch (e) {
      console.warn("Failed to register LiveKit globals:", e);
    }
  }
}

// Ensure globals on initial import on native
ensureLiveKitGlobals();

async function loadLK() {
  ensureLiveKitGlobals();
  if (!cached) cached = await import("livekit-client");
  return cached;
}

export type LiveConnection = {
  room: RoomType;
  disconnect: () => Promise<void>;
};

let activePublisher: LiveConnection | null = null;
let activeLocalTrack: any = null;

export function getActivePublisher(): LiveConnection | null {
  return activePublisher;
}

export function setActivePublisher(conn: LiveConnection | null, track?: any) {
  activePublisher = conn;
  activeLocalTrack = track || null;
}

export function getActiveLocalTrack(): any {
  return activeLocalTrack;
}

/**
 * Creates an animated video track for web environments where camera access is blocked
 * (e.g. running on an HTTP IP address where Chrome blocks navigator.mediaDevices.getUserMedia).
 */
function createWebFallbackTrack(lk: any): any {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 480;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  let frame = 0;
  const draw = () => {
    frame++;
    // Dark background with gradient pulse
    const grad = ctx.createLinearGradient(0, 0, 640, 480);
    const shift = (Math.sin(frame * 0.08) + 1) / 2;
    grad.addColorStop(0, "#0D0F12");
    grad.addColorStop(0.5, `rgb(${Math.floor(25 + 20 * shift)}, 14, 20)`);
    grad.addColorStop(1, "#0A0B0E");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 640, 480);

    // Live pulsing badge
    ctx.beginPath();
    ctx.arc(320, 200, 50 + Math.sin(frame * 0.12) * 6, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(229, 9, 20, 0.2)";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(320, 200, 34, 0, Math.PI * 2);
    ctx.fillStyle = "#E50914";
    ctx.fill();

    // Wordmark
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 26px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("azadi⁺ FIELD BROADCAST", 320, 280);

    ctx.fillStyle = "#A0AAB0";
    ctx.font = "16px sans-serif";
    ctx.fillText("Live Stream Active from Field", 320, 315);

    const timeStr = new Date().toLocaleTimeString();
    ctx.fillStyle = "#E50914";
    ctx.font = "bold 15px monospace";
    ctx.fillText(`● LIVE · ${timeStr}`, 320, 350);
  };

  draw();
  const animInterval = setInterval(draw, 100);

  const stream = (canvas as any).captureStream ? (canvas as any).captureStream(20) : null;
  if (!stream || !stream.getVideoTracks().length) return null;

  const track = new lk.LocalVideoTrack(stream.getVideoTracks()[0]);
  const origStop = track.stop.bind(track);
  track.stop = () => {
    clearInterval(animInterval);
    origStop();
  };
  return track;
}

export async function publishLive({ url, token }: { url: string; token: string }): Promise<LiveConnection> {
  ensureLiveKitGlobals();
  const lk = await loadLK();
  const room = new lk.Room({
    adaptiveStream: true,
    dynacast: true,
  });

  await room.connect(url, token);

  // Enable camera or fallback virtual stream on web
  let customFallbackTrack: any = null;
  if (Platform.OS === "web") {
    let cameraSuccess = false;
    const canUseCamera = typeof navigator !== "undefined" && Boolean(navigator?.mediaDevices?.getUserMedia);
    if (canUseCamera) {
      try {
        await room.localParticipant.setCameraEnabled(true);
        cameraSuccess = true;
      } catch (err) {
        console.warn("Real camera unavailable, using virtual broadcast track:", err);
      }
    }

    if (!cameraSuccess) {
      try {
        customFallbackTrack = createWebFallbackTrack(lk);
        if (customFallbackTrack) {
          await room.localParticipant.publishTrack(customFallbackTrack, { name: "camera" });
        }
      } catch (fbErr) {
        console.warn("Virtual fallback track error:", fbErr);
      }
    }

    // Try microphone if available
    if (canUseCamera) {
      try {
        await room.localParticipant.setMicrophoneEnabled(true);
      } catch {}
    }
  } else {
    // Native (Android/iOS)
    try {
      await room.localParticipant.setCameraEnabled(true);
    } catch (err: any) {
      console.warn("Failed to enable native camera track:", err);
      throw new Error(err?.message || "Camera access failed during broadcast startup.");
    }
    try {
      await room.localParticipant.setMicrophoneEnabled(true);
    } catch (err: any) {
      console.warn("Failed to enable microphone track:", err);
    }
  }

  const liveConn: LiveConnection = {
    room,
    disconnect: async () => {
      try {
        if (customFallbackTrack) {
          customFallbackTrack.stop();
        }
        await room.localParticipant.setCameraEnabled(false);
        await room.localParticipant.setMicrophoneEnabled(false);
      } catch {
        /* ignore — already torn down */
      }
      await room.disconnect();
      if (activePublisher?.room === room) {
        activePublisher = null;
        activeLocalTrack = null;
      }
    },
  };

  let localVideoTrack: any = customFallbackTrack;
  if (!localVideoTrack) {
    try {
      const pubs = room.localParticipant.videoTrackPublications;
      if (pubs && pubs.size > 0) {
        localVideoTrack = pubs.values().next().value?.track || null;
      }
    } catch {}
  }
  setActivePublisher(liveConn, localVideoTrack);
  return liveConn;
}

export async function subscribeLive({ url, token }: { url: string; token: string }): Promise<LiveConnection> {
  ensureLiveKitGlobals();
  const lk = await loadLK();
  const room = new lk.Room({ adaptiveStream: true });
  await room.connect(url, token);
  return {
    room,
    disconnect: async () => {
      try {
        await room.disconnect();
      } catch {
        /* ignore */
      }
    },
  };
}

/**
 * Robust UTF-8 payload decoder for LiveKit DataChannel events that works
 * reliably across Hermes, React Native, and Web without relying on global TextDecoder.
 */
export function decodeLivePayload(payload: Uint8Array): string {
  try {
    if (typeof TextDecoder !== "undefined") {
      return new TextDecoder().decode(payload);
    }
  } catch {}
  try {
    let out = "";
    for (let i = 0; i < payload.length; i++) {
      out += String.fromCharCode(payload[i]);
    }
    return decodeURIComponent(escape(out));
  } catch {
    return "";
  }
}

/**
 * Robust UTF-8 payload encoder for LiveKit DataChannel events.
 */
export function encodeLivePayload(str: string): Uint8Array {
  try {
    if (typeof TextEncoder !== "undefined") {
      return new TextEncoder().encode(str);
    }
  } catch {}
  try {
    const unescaped = unescape(encodeURIComponent(str));
    const arr = new Uint8Array(unescaped.length);
    for (let i = 0; i < unescaped.length; i++) {
      arr[i] = unescaped.charCodeAt(i);
    }
    return arr;
  } catch {
    return new Uint8Array(0);
  }
}

/**
 * Toggles camera facing mode between user (front) and environment (back).
 * Works across WebRTC native (Android/iOS) and Web browser.
 */
export async function toggleCameraFacing(
  room: any,
  currentTrack: any,
  targetFacing?: "user" | "environment"
): Promise<"user" | "environment"> {
  if (!room) return "user";

  // Native React Native WebRTC track switch
  if (currentTrack?.mediaStreamTrack?._switchCamera) {
    try {
      currentTrack.mediaStreamTrack._switchCamera();
      return targetFacing || "environment";
    } catch (e) {
      console.warn("native _switchCamera failed:", e);
    }
  }

  // LiveKit restartTrack with facingMode
  if (currentTrack?.restartTrack) {
    const nextFacing = targetFacing || "environment";
    try {
      await currentTrack.restartTrack({ facingMode: nextFacing });
      return nextFacing;
    } catch (e) {
      console.warn("restartTrack with facingMode failed:", e);
    }
  }

  // Browser device enumeration fallback
  if (typeof navigator !== "undefined" && navigator.mediaDevices?.enumerateDevices) {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter((d) => d.kind === "videoinput");
      if (videoDevices.length > 1) {
        const activeId = room.getActiveDevice?.("videoinput");
        const nextDevice = videoDevices.find((d) => d.deviceId !== activeId) || videoDevices[0];
        if (nextDevice?.deviceId && room.switchActiveDevice) {
          await room.switchActiveDevice("videoinput", nextDevice.deviceId);
          return "environment";
        }
      }
    } catch (e) {
      console.warn("enumerateDevices switch failed:", e);
    }
  }

  return "user";
}
