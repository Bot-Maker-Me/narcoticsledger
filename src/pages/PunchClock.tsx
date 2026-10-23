import { useState } from 'react';
import { Clock } from 'lucide-react';
import toast from 'react-hot-toast';
import { useClockIn, useClockOut, useTimePunches } from '@/hooks/useOperations';

function hoursBetween(a: string, b: string | null) {
  if (!b) return null;
  return ((new Date(b).getTime() - new Date(a).getTime()) / 36e5).toFixed(2);
}

export default function PunchClock() {
  const { data, isError } = useTimePunches();
  const clockIn = useClockIn();
  const clockOut = useClockOut();
  const [name, setName] = useState('');

  return (
    <div>
      <h1 className="text-2xl font-bold text-neutral-900">Punch Clock</h1>
      <p className="mt-1 mb-6 text-sm text-neutral-500">Track staff time for the pharmacy floor.</p>
      {isError && <p className="mb-4 text-sm text-warning-700">Run the latest database migration to enable this module.</p>}

      <form
        className="card mb-6 flex flex-col gap-3 p-5 sm:flex-row"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return;
          try {
            await clockIn.mutateAsync(name.trim());
            toast.success(`${name} clocked in`);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Clock-in failed');
          }
        }}
      >
        <input className="input-field" placeholder="Staff name" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn-primary">
          <Clock className="h-4 w-4" /> Clock in
        </button>
      </form>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500">
            <tr>
              <th className="px-4 py-3">Staff</th>
              <th className="px-4 py-3">In</th>
              <th className="px-4 py-3">Out</th>
              <th className="px-4 py-3">Hours</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((row) => (
              <tr key={row.id} className="border-t border-neutral-50">
                <td className="px-4 py-3 font-medium">{row.staff_name}</td>
                <td className="px-4 py-3 text-neutral-600">{new Date(row.clock_in).toLocaleString()}</td>
                <td className="px-4 py-3 text-neutral-600">{row.clock_out ? new Date(row.clock_out).toLocaleString() : '—'}</td>
                <td className="px-4 py-3">{hoursBetween(row.clock_in, row.clock_out) ?? '—'}</td>
                <td className="px-4 py-3">
                  {!row.clock_out && (
                    <button
                      className="btn-secondary text-xs"
                      onClick={async () => {
                        await clockOut.mutateAsync(row.id);
                        toast.success('Clocked out');
                      }}
                    >
                      Clock out
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
