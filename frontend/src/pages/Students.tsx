import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, Search, Filter } from 'lucide-react';
import { studentApi } from '../services/api';
import { Student } from '../types';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';

export default function Students() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  useEffect(() => {
    studentApi.getAll()
      .then(setStudents)
      .catch(() => setError('Failed to load students.'))
      .finally(() => setLoading(false));
  }, []);

  const departments = Array.from(new Set(students.map(s => s.department)));
  const types = Array.from(new Set(students.map(s => s.student_type)));

  const filtered = students.filter(
    (s) =>
      (s.name.toLowerCase().includes(search.toLowerCase()) || s.id.toLowerCase().includes(search.toLowerCase())) &&
      (deptFilter === '' || s.department === deptFilter) &&
      (typeFilter === '' || s.student_type === typeFilter)
  );

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message={error} />;

  return (
    <div className="p-8 max-w-[1400px] mx-auto w-full">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-navy-900 mb-1">Student Directory</h1>
        <p className="text-sm text-navy-500">Registered students and arrival status.</p>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap gap-4 mb-6 items-center">
        <div className="relative flex-1 min-w-[300px]">
          <Search size={16} className="absolute left-3.5 top-2.5 text-navy-400" />
          <input
            type="text"
            placeholder="Search students..."
            className="form-input pl-10 h-10 w-full"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        
        <div className="flex items-center gap-3">
          <Filter size={16} className="text-navy-400" />
          <select 
            className="form-input h-10 py-0 min-w-[160px]"
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
          >
            <option value="">All Departments</option>
            {departments.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          
          <select 
            className="form-input h-10 py-0 min-w-[160px]"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="">All Types</option>
            {types.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      <div className="bg-white border border-navy-200 rounded overflow-x-auto shadow-sm">
        <table className="w-full">
          <thead className="table-header">
            <tr>
              <th className="px-5 py-3 text-left text-[11px] font-bold text-navy-500 uppercase tracking-wider border-b border-navy-200">Student</th>
              <th className="px-5 py-3 text-left text-[11px] font-bold text-navy-500 uppercase tracking-wider border-b border-navy-200">Student ID</th>
              <th className="px-5 py-3 text-left text-[11px] font-bold text-navy-500 uppercase tracking-wider border-b border-navy-200">Department</th>
              <th className="px-5 py-3 text-left text-[11px] font-bold text-navy-500 uppercase tracking-wider border-b border-navy-200">Student Type</th>
              <th className="px-5 py-3 text-left text-[11px] font-bold text-navy-500 uppercase tracking-wider border-b border-navy-200">NFC Status</th>
              <th className="px-5 py-3 text-left text-[11px] font-bold text-navy-500 uppercase tracking-wider border-b border-navy-200">Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => (
              <tr key={s.id} className="border-b border-navy-100 hover:bg-navy-50 transition-colors">
                <td className="px-5 py-3 text-sm font-medium text-navy-900">{s.name}</td>
                <td className="px-5 py-3 text-sm font-mono text-navy-600">{s.id}</td>
                <td className="px-5 py-3 text-sm text-navy-700">{s.department}</td>
                <td className="px-5 py-3 text-sm text-navy-700">
                  <span className={`badge ${s.student_type === 'Day Scholar' ? 'badge-supported' : 'badge-partial'}`}>
                    {s.student_type}
                  </span>
                </td>
                <td className="px-5 py-3 text-sm">
                  {s.nfc_status === 'ACTIVE' ? (
                    <span className="text-emerald-600 font-medium">Active</span>
                  ) : (
                    <span className="text-navy-400 font-medium">Inactive</span>
                  )}
                </td>
                <td className="px-5 py-3 text-sm">
                  <Link
                    to={`/students/${s.id}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-navy-200 text-sm font-medium text-navy-700 rounded hover:bg-navy-50 transition-colors"
                  >
                    View
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="py-16 text-center">
            <Users size={32} className="text-navy-200 mx-auto mb-4" />
            <p className="text-sm text-navy-500 font-medium">No students found.</p>
          </div>
        )}
      </div>
    </div>
  );
}
