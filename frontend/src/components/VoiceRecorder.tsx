import { useEffect, useRef, useState } from 'react';
import { Mic, Square, RotateCcw } from 'lucide-react';

export interface VoiceRecording {
  base64: string;     // recorded audio, base64 encoded (no data: prefix)
  mimeType: string;   // e.g. audio/webm (Chrome, Firefox) or audio/mp4 (Safari)
  durationSec: number;
}

interface Props {
  onChange: (recording: VoiceRecording | null) => void;
  disabled?: boolean;
}

const MAX_SECONDS = 120;

// Gemini accepts the browsers' own recording formats (WebM/Opus, MP4/AAC), so the recording
// is uploaded as-is. Only the base type is sent, e.g. "audio/webm;codecs=opus" -> "audio/webm".
function baseMimeType(...candidates: string[]): string {
  const type = candidates.find((t) => t && t.startsWith('audio/')) || 'audio/webm';
  return type.split(';')[0].trim();
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export default function VoiceRecorder({ onChange, disabled }: Props) {
  const [state, setState] = useState<'idle' | 'recording' | 'processing' | 'recorded'>('idle');
  const [seconds, setSeconds] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const secondsRef = useRef(0);

  useEffect(() => () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    recorderRef.current?.stream.getTracks().forEach((t) => t.stop());
  }, []);

  useEffect(() => () => { if (audioUrl) URL.revokeObjectURL(audioUrl); }, [audioUrl]);

  const stopRecording = () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  };

  const startRecording = async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Recording is not supported in this browser. Please type your explanation instead.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setState('processing');
        try {
          const mimeType = baseMimeType(recorder.mimeType, chunksRef.current[0]?.type || '');
          const audio = new Blob(chunksRef.current, { type: mimeType });
          if (audio.size === 0) throw new Error('Recording was empty');
          setAudioUrl(URL.createObjectURL(audio));
          onChange({ base64: await blobToBase64(audio), mimeType, durationSec: secondsRef.current });
          setState('recorded');
        } catch (err) {
          console.error('Could not process recording:', err);
          setError('The recording was empty or could not be read. Please record again, or type instead.');
          setState('idle');
        }
      };
      recorderRef.current = recorder;
      recorder.start(1000); // collect data every second so nothing is lost if the browser stops early
      setSeconds(0);
      secondsRef.current = 0;
      setState('recording');
      timerRef.current = window.setInterval(() => {
        setSeconds((s) => {
          secondsRef.current = s + 1;
          if (s + 1 >= MAX_SECONDS) stopRecording();
          return s + 1;
        });
      }, 1000);
    } catch {
      setError('Microphone access was denied. Allow microphone access or type your explanation instead.');
    }
  };

  const reset = () => {
    setAudioUrl(null);
    setSeconds(0);
    setState('idle');
    onChange(null);
  };

  const timeLabel = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

  return (
    <div className="rounded-lg border border-navy-200 bg-navy-50 p-5 text-center">
      {state === 'idle' && (
        <>
          <button
            type="button"
            onClick={startRecording}
            disabled={disabled}
            className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-600 text-white shadow hover:bg-red-700 disabled:opacity-50"
            aria-label="Start recording"
          >
            <Mic size={26} />
          </button>
          <p className="mt-3 text-sm text-navy-600">Tap to record. Explain in your own words why you were late.</p>
        </>
      )}

      {state === 'recording' && (
        <>
          <button
            type="button"
            onClick={stopRecording}
            className="mx-auto flex h-16 w-16 animate-pulse items-center justify-center rounded-full bg-red-600 text-white shadow"
            aria-label="Stop recording"
          >
            <Square size={22} fill="currentColor" />
          </button>
          <p className="mt-3 font-mono text-sm font-semibold text-red-600">Recording {timeLabel}</p>
          <p className="text-xs text-navy-400">Tap to stop (max {MAX_SECONDS / 60} minutes)</p>
        </>
      )}

      {state === 'processing' && <p className="text-sm text-navy-600">Preparing recording…</p>}

      {state === 'recorded' && audioUrl && (
        <div className="space-y-3">
          <audio controls src={audioUrl} className="w-full" />
          <button type="button" onClick={reset} disabled={disabled} className="btn-secondary mx-auto">
            <RotateCcw size={14} /> Record again
          </button>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  );
}
