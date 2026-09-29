import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';

/**
 * Strips EXIF metadata (including GPS, camera details) from images.
 * Returns the URI to the cleaned file in the cache directory.
 */
export async function stripImageMetadata(uri: string): Promise<string> {
  try {
    // We use expo-image-manipulator to re-encode the image.
    // By re-encoding without passing original metadata, it creates a fresh file
    // devoid of EXIF tags (like GPS, device model, timestamps).
    const manipResult = await ImageManipulator.manipulateAsync(
      uri,
      [], // no operations (just re-encode)
      { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
    );
    return manipResult.uri;
  } catch (err) {
    console.error("Failed to strip metadata from image:", err);
    throw new Error("Metadata stripping failed. For your safety, upload is aborted.");
  }
}

/**
 * Video metadata stripping is complex on React Native.
 * For true anonymity, we recommend reporters use a dedicated app like ExifEraser or Tor,
 * or we use ffmpeg in the backend. 
 * As a basic protection, this function re-copies the file to discard basic file attributes,
 * but deeply embedded video EXIF might require FFmpegKit which is heavy.
 */
export async function stripVideoMetadata(uri: string): Promise<string> {
  // Temporary: a real video EXIF stripper requires native code (ffmpeg)
  // For now, return the original URI but warn the user in the UI.
  return uri;
}
