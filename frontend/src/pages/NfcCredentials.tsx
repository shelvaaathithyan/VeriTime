import { useEffect, useState } from 'react';
import { CreditCard, Plus, CheckCircle2, AlertCircle } from 'lucide-react';
import { nfcApi, studentApi } from '../services/api';
import { NfcCredential, Student } from '../types';
import LoadingSpinner from '../components/LoadingSpinner';

export default function NfcCredentials() {
  const [credentials, setCredentials] = useState<NfcCredential[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [cardId, setCardId] = useState('');
  const [studentId, setStudentId] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [creds, studs] = await Promise.all([nfcApi.getCredentials(), studentApi.getAll()]);
      setCredentials(creds);
      setStudents(studs);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cardId.trim() || !studentId) return;
    setSaving(true);
    setSaveResult(null);
    try {
      await nfcApi.register(cardId.trim(), studentId);
      setSaveResult({ ok: true, msg: `Credential "${cardId.trim()}" associated with ${studentId}.` });
      setCardId('');
      load();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Registration failed';
      setSaveResult({ ok: false, msg: message });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="p-8 max-w-[1400px] mx-auto w-full">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-navy-900 mb-1">NFC Credential Management</h1>
        <p className="text-sm text-navy-500">Associate real NFC card identifiers with registered students</p>
      </div>

      {/* Privacy Notice */}
      <div className="bg-navy-50 border border-navy-200 rounded-lg px-5 py-4 mb-6">
        <div className="text-sm text-navy-700 leading-relaxed">
          <strong>Privacy Notice:</strong> This page manages the association between NFC card identifiers
          and student records. The system reads only the identifier exposed by the card and does not
          clone, modify, or emulate any credential. Card identifiers are stored securely and not
          displayed publicly.
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Register Form */}
        <div className="card">
          <div className="card-header">
            <h2 className="text-sm font-semibold text-navy-700 flex items-center gap-2">
              <Plus size={14} />
              Register NFC Credential
            </h2>
          </div>
          <div className="card-body">
            <p className="text-sm text-navy-500 mb-5 leading-relaxed">
              Enter the NFC card identifier as detected by the Android security app.
              Associate it with a student account. The Android app must detect the real physical card first.
            </p>
            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <label className="form-label" htmlFor="card-id">Card Identifier</label>
                <input
                  id="card-id"
                  type="text"
                  className="form-input font-mono"
                  placeholder="e.g. 04:A7:23:91:6B:12:45"
                  value={cardId}
                  onChange={(e) => setCardId(e.target.value)}
                  required
                />
                <p className="text-xs text-navy-400 mt-1">
                  This must be the actual identifier from the Android app.
                </p>
              </div>
              <div>
                <label className="form-label" htmlFor="student-select">Student</label>
                <select
                  id="student-select"
                  className="form-input"
                  value={studentId}
                  onChange={(e) => setStudentId(e.target.value)}
                  required
                >
                  <option value="">Select student...</option>
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.id}) — {s.department}
                    </option>
                  ))}
                </select>
              </div>

              {saveResult && (
                <div className={`flex items-start gap-2 rounded px-3 py-2.5 text-sm ${
                  saveResult.ok ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-red-50 border border-red-200 text-red-700'
                }`}>
                  {saveResult.ok ? <CheckCircle2 size={15} className="mt-0.5" /> : <AlertCircle size={15} className="mt-0.5" />}
                  {saveResult.msg}
                </div>
              )}

              <button
                type="submit"
                id="btn-register-credential"
                className="btn-primary w-full justify-center"
                disabled={saving || !cardId.trim() || !studentId}
              >
                <CreditCard size={15} />
                {saving ? 'Registering...' : 'Register Credential'}
              </button>
            </form>
          </div>
        </div>

        {/* Registered Credentials */}
        <div className="card">
          <div className="card-header">
            <h2 className="text-sm font-semibold text-navy-700 flex items-center gap-2">
              <CreditCard size={14} />
              Registered Credentials ({credentials.length})
            </h2>
          </div>
          <div className="overflow-y-auto max-h-96">
            {credentials.length === 0 ? (
              <div className="py-10 text-center text-navy-400 text-sm">
                No credentials registered.
              </div>
            ) : (
              <div className="divide-y divide-navy-100">
                {credentials.map((c, i) => (
                  <div key={i} className="px-5 py-4">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="font-mono text-xs text-navy-500 break-all flex-1">
                        {c.card_identifier}
                      </div>
                      <span className={`badge flex-shrink-0 ${c.status === 'ACTIVE' ? 'badge-supported' : 'badge-inconsistent'}`}>
                        {c.status}
                      </span>
                    </div>
                    <div className="text-sm font-medium text-navy-800">{c.name || '—'}</div>
                    <div className="text-xs text-navy-400">{c.student_id} · {c.department}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
