import React, { useState } from 'react';

const ShiftReportPdf = () => {
  const [shift, setShift] = useState('Shift 1');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState('');

  const download = async () => {
    setStatus('Generating...');
    try {
      const url = `http://localhost:4103/api/custom-views/shift-report-pdf?shift=${encodeURIComponent(shift)}&date=${encodeURIComponent(date)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = `shift-report-${date}-${shift.replace(/\s+/g, '_')}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
      setStatus('Downloaded.');
    } catch (e) {
      setStatus('Error: ' + e.message);
    }
  };

  const preview = async () => {
    setStatus('Opening preview...');
    try {
      const url = `http://localhost:4103/api/custom-views/shift-report-pdf?shift=${encodeURIComponent(shift)}&date=${encodeURIComponent(date)}`;
      window.open(url, '_blank');
      setStatus('Opened in new tab.');
    } catch (e) {
      setStatus('Error: ' + e.message);
    }
  };

  return (
    <div style={{ background: '#1e293b', borderRadius: 8, padding: 16, marginBottom: 16 }}>
      <h3 style={{ color: '#e2e8f0', marginTop: 0 }}>Shift Report (PDF)</h3>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <label style={{ color: '#94a3b8', fontSize: 12, display: 'block' }}>Shift</label>
          <select value={shift} onChange={(e) => setShift(e.target.value)} style={{ padding: 8, background: '#0f172a', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 4 }}>
            <option>Shift 1</option>
            <option>Shift 2</option>
            <option>Shift 3</option>
          </select>
        </div>
        <div>
          <label style={{ color: '#94a3b8', fontSize: 12, display: 'block' }}>Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ padding: 8, background: '#0f172a', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 4 }} />
        </div>
        <button onClick={download} style={{ background: '#0ea5e9', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 14px', cursor: 'pointer' }}>Download PDF</button>
        <button onClick={preview} style={{ background: '#475569', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 14px', cursor: 'pointer' }}>Preview</button>
      </div>
      {status && <div style={{ color: '#94a3b8', marginTop: 12, fontSize: 13 }}>{status}</div>}
      <div style={{ color: '#94a3b8', marginTop: 8, fontSize: 12 }}>
        Generates a one-page handoff summarizing planned vs. actual units, downtime, and changeovers per line.
      </div>
    </div>
  );
};

export default ShiftReportPdf;
