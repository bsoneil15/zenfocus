export async function createAudioBuffer(
  audioData: string | ArrayBuffer, 
  audioContext: AudioContext
): Promise<AudioBuffer> {
  try {
    let arrayBuffer: ArrayBuffer;
    
    if (typeof audioData === "string") {
      // If it's a URL, fetch the audio data
      console.log('Fetching audio from URL:', audioData);
      
      const response = await fetch(audioData, {
        mode: 'cors',
        credentials: 'same-origin',
        cache: 'no-cache',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });
      
      console.log('Audio fetch response:', {
        status: response.status,
        statusText: response.statusText,
        contentType: response.headers.get('content-type'),
        contentLength: response.headers.get('content-length')
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch audio from ${audioData}: ${response.status} ${response.statusText}`);
      }
      
      const contentType = response.headers.get('content-type');
      const validContentTypes = ['audio/', 'application/octet-stream'];
      const isValidContentType = contentType && validContentTypes.some(type => contentType.includes(type));
      
      if (!isValidContentType) {
        console.error(`Invalid content type for audio: ${contentType}`);
        throw new Error(`Expected audio file but received: ${contentType || 'unknown content type'}`);
      }
      
      arrayBuffer = await response.arrayBuffer();
      
      if (arrayBuffer.byteLength === 0) {
        throw new Error('Audio file is empty or corrupted');
      }
      
      console.log('Audio buffer created successfully, size:', arrayBuffer.byteLength, 'bytes');
    } else {
      arrayBuffer = audioData;
    }
    
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    console.log('Audio decoded successfully, duration:', audioBuffer.duration, 'seconds');
    return audioBuffer;
  } catch (error) {
    console.error("Failed to create audio buffer:", {
      url: typeof audioData === 'string' ? audioData : 'ArrayBuffer',
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined
    });
    throw new Error(`Audio processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export function createLoopingAudio(
  audioBuffer: AudioBuffer,
  audioContext: AudioContext,
  gainNode: GainNode
): AudioBufferSourceNode {
  const source = audioContext.createBufferSource();
  source.buffer = audioBuffer;
  source.loop = true;
  source.loopStart = 0;
  source.loopEnd = audioBuffer.duration;
  source.connect(gainNode);
  
  return source;
}

export function generateNotificationSound(audioContext: AudioContext): AudioBuffer {
  const sampleRate = audioContext.sampleRate;
  const duration = 0.3; // 300ms
  const length = sampleRate * duration;
  const buffer = audioContext.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);
  
  // Generate a pleasant notification sound
  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    const freq1 = 800 * Math.exp(-t * 3); // Decreasing frequency
    const freq2 = 600 * Math.exp(-t * 2);
    const envelope = Math.exp(-t * 4); // Exponential decay
    
    data[i] = envelope * (
      Math.sin(2 * Math.PI * freq1 * t) * 0.3 +
      Math.sin(2 * Math.PI * freq2 * t) * 0.2
    );
  }
  
  return buffer;
}

export async function downloadAudioAsBlob(url: string): Promise<Blob> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download audio: ${response.statusText}`);
  }
  return await response.blob();
}

export function createAudioUrl(blob: Blob): string {
  return URL.createObjectURL(blob);
}

export function revokeAudioUrl(url: string): void {
  URL.revokeObjectURL(url);
}
