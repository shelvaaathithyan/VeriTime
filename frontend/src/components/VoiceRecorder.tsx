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
    <div className="rounded-2xl bg-white p-8 text-center transition-colors min-h-[220px] flex flex-col justify-center">
      {state === 'idle' && (
        <div className="animate-in fade-in zoom-in duration-200">
          <div className="relative inline-flex items-center justify-center mb-5">
            <div className="absolute inset-0 bg-blue-50 rounded-full scale-150"></div>
            <button
              type="button"
              onClick={startRecording}
              disabled={disabled}
              className="relative flex h-20 w-20 items-center justify-center rounded-full bg-blue-600 text-white hover:bg-blue-700 hover:scale-105 shadow-[0_8px_20px_rgba(37,99,235,0.2)] disabled:opacity-50 transition-all z-10"
              aria-label="Start recording"
            >
              <Mic size={32} />
            </button>
          </div>
          <p className="text-[15px] font-bold text-slate-800 mb-1">Tap to record</p>
          <p className="text-sm text-slate-500">Speak naturally.<br/>We'll convert your voice to text.</p>
        </div>
      )}

      {state === 'recording' && (
        <div className="animate-in fade-in zoom-in duration-200">
          <div className="flex items-center justify-center gap-2 text-red-500 font-bold text-sm tracking-widest uppercase mb-4">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"></span>
            Recording...
          </div>
          
          {/* Visual Waveform */}
          <div className="flex items-center justify-center gap-1 h-12 mb-6 opacity-80">
            {[...Array(11)].map((_, i) => (
              <div 
                key={i} 
                className="w-1.5 bg-blue-500 rounded-full animate-pulse"
                style={{
                  height: `${Math.max(20, Math.random() * 100)}%`,
                  animationDuration: `${0.5 + Math.random() * 0.5}s`
                }}
              ></div>
            ))}
          </div>

          <div className="relative inline-flex flex-col items-center justify-center">
            <button
              type="button"
              onClick={stopRecording}
              className="relative flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-slate-800 border border-slate-200 hover:bg-slate-200 z-10 hover:scale-95 transition-all shadow-sm mb-3"
              aria-label="Stop recording"
            >
              <Square size={20} fill="currentColor" className="text-red-500" />
            </button>
            <p className="font-mono text-xl font-bold text-slate-800 mb-1">{timeLabel}</p>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Tap to stop</p>
          </div>
        </div>
      )}

      {state === 'processing' && (
        <div className="flex flex-col items-center justify-center gap-4">
          <div className="w-6 h-6 border-2 border-slate-200 border-t-blue-600 rounded-full animate-spin"></div>
          <p className="text-[15px] font-medium text-slate-600">Preparing recording…</p>
        </div>
      )}

      {state === 'recorded' && audioUrl && (
        <div className="space-y-6 animate-in fade-in duration-200 w-full max-w-sm mx-auto">
          <div className="flex flex-col items-center gap-2 mb-2">
            <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mb-1">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7"></path></svg>
            </div>
            <p className="text-[15px] font-bold text-slate-800">Explanation recorded</p>
          </div>
          
          <div className="rounded-xl overflow-hidden bg-slate-50 border border-slate-200 p-2 shadow-sm">
            <audio controls src={audioUrl} className="w-full h-10 outline-none" />
          </div>
          
          <button type="button" onClick={reset} disabled={disabled} className="mx-auto flex items-center gap-2 px-5 py-2.5 bg-white border border-slate-200 text-slate-600 text-sm font-semibold rounded-xl hover:bg-slate-50 hover:text-slate-900 transition-colors shadow-sm">
            <RotateCcw size={16} /> Re-record
          </button>
        </div>
      )}

      {error && <p className="mt-4 text-sm font-medium text-red-600 bg-red-50 p-3 rounded-xl">{error}</p>}
    </div>
  );
}
