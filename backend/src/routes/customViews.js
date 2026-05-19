// Custom Views for Manufacturing Operations
// 4 endpoints: production-throughput, downtime-heatmap, shift-report-pdf, production-rules
const express = require('express');
const router = express.Router();

// In-memory production rules store (CRUD: line capacity, changeover rules)
let rulesStore = [
  { id: 1, line_id: 'LINE-A', line_name: 'Assembly Line A', capacity_per_hour: 120, changeover_minutes: 25, changeover_from: 'SKU-100', changeover_to: 'SKU-200', notes: 'Standard PVC mold swap', updated_at: new Date().toISOString() },
  { id: 2, line_id: 'LINE-B', line_name: 'Assembly Line B', capacity_per_hour: 95, changeover_minutes: 40, changeover_from: 'SKU-200', changeover_to: 'SKU-300', notes: 'Requires tooling calibration', updated_at: new Date().toISOString() },
  { id: 3, line_id: 'LINE-C', line_name: 'Packaging Line C', capacity_per_hour: 220, changeover_minutes: 15, changeover_from: 'BOX-S', changeover_to: 'BOX-L', notes: 'Quick die change', updated_at: new Date().toISOString() },
  { id: 4, line_id: 'LINE-D', line_name: 'CNC Cell D', capacity_per_hour: 60, changeover_minutes: 55, changeover_from: 'ALLOY-A', changeover_to: 'ALLOY-B', notes: 'Coolant flush required', updated_at: new Date().toISOString() },
];
let nextRuleId = 5;

// =====================
// 1) VIZ: Production Throughput per line (24 hour series)
// =====================
router.get('/production-throughput', (req, res) => {
  try {
    const lines = ['LINE-A', 'LINE-B', 'LINE-C', 'LINE-D'];
    const targets = { 'LINE-A': 120, 'LINE-B': 95, 'LINE-C': 220, 'LINE-D': 60 };
    const hours = [];
    for (let h = 0; h < 24; h++) {
      const point = { hour: `${String(h).padStart(2, '0')}:00` };
      lines.forEach((line) => {
        // deterministic-ish pseudo data with shift dip
        const base = targets[line];
        const shiftFactor = h >= 0 && h < 6 ? 0.75 : h >= 14 && h < 22 ? 1.05 : 0.95;
        const wobble = ((h * 7 + line.charCodeAt(5)) % 17) / 100;
        point[line] = Math.round(base * shiftFactor * (1 - wobble * 0.5));
      });
      hours.push(point);
    }
    res.json({
      lines,
      targets,
      series: hours,
      generated_at: new Date().toISOString(),
      unit: 'units/hour'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =====================
// 2) VIZ: Downtime Heatmap (line x shift)
// =====================
router.get('/downtime-heatmap', (req, res) => {
  try {
    const lines = ['LINE-A', 'LINE-B', 'LINE-C', 'LINE-D'];
    const shifts = ['Shift 1 (06-14)', 'Shift 2 (14-22)', 'Shift 3 (22-06)'];
    const cells = [];
    lines.forEach((line, li) => {
      shifts.forEach((shift, si) => {
        // minutes of downtime per shift
        const baseDown = 5 + ((li * 11 + si * 7) % 35);
        const reason = ['Mechanical', 'Material starved', 'Operator break', 'Quality hold', 'Changeover'][(li + si) % 5];
        cells.push({
          line,
          shift,
          shift_idx: si,
          line_idx: li,
          downtime_minutes: baseDown,
          top_reason: reason,
          severity: baseDown > 30 ? 'high' : baseDown > 15 ? 'medium' : 'low',
        });
      });
    });
    res.json({
      lines,
      shifts,
      cells,
      max_minutes: Math.max(...cells.map((c) => c.downtime_minutes)),
      generated_at: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =====================
// 3) NON-VIZ: Shift Report PDF
// =====================
router.get('/shift-report-pdf', (req, res) => {
  try {
    const shift = req.query.shift || 'Shift 1';
    const date = req.query.date || new Date().toISOString().slice(0, 10);

    const lines = rulesStore.map((r) => ({
      line: r.line_name,
      planned_units: r.capacity_per_hour * 8,
      actual_units: Math.round(r.capacity_per_hour * 8 * (0.78 + ((r.id * 13) % 20) / 100)),
      downtime_min: 15 + ((r.id * 7) % 45),
      changeovers: 1 + (r.id % 3),
    }));

    const totalPlanned = lines.reduce((s, l) => s + l.planned_units, 0);
    const totalActual = lines.reduce((s, l) => s + l.actual_units, 0);
    const oee = ((totalActual / totalPlanned) * 100).toFixed(1);

    // Build a minimal valid PDF (1 page, plain text, no external deps)
    const reportLines = [
      'AI Manufacturing Operations - Shift Report',
      `Date: ${date}    Shift: ${shift}`,
      '',
      'Per-Line Summary:',
      ...lines.map((l) =>
        `  ${l.line.padEnd(22)}  Plan ${String(l.planned_units).padStart(5)}  Act ${String(l.actual_units).padStart(5)}  DT ${String(l.downtime_min).padStart(3)}m  CO ${l.changeovers}`
      ),
      '',
      `Totals:  Planned=${totalPlanned}  Actual=${totalActual}  OEE=${oee}%`,
      '',
      'Notes: auto-generated handoff. Verify deltas with line supervisor.',
      `Generated: ${new Date().toISOString()}`,
    ];

    const pdf = buildSimplePdf(reportLines);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="shift-report-${date}-${shift.replace(/\s+/g, '_')}.pdf"`);
    res.setHeader('Content-Length', pdf.length);
    res.end(pdf);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =====================
// 4) NON-VIZ: Production Rules editor (CRUD line capacity + changeover rules)
// =====================
router.get('/production-rules', (req, res) => {
  res.json({ items: rulesStore, count: rulesStore.length, generated_at: new Date().toISOString() });
});

router.post('/production-rules', (req, res) => {
  try {
    const b = req.body || {};
    const rec = {
      id: nextRuleId++,
      line_id: b.line_id || `LINE-${nextRuleId}`,
      line_name: b.line_name || `Line ${nextRuleId}`,
      capacity_per_hour: Number(b.capacity_per_hour) || 100,
      changeover_minutes: Number(b.changeover_minutes) || 30,
      changeover_from: b.changeover_from || 'SKU-X',
      changeover_to: b.changeover_to || 'SKU-Y',
      notes: b.notes || '',
      updated_at: new Date().toISOString(),
    };
    rulesStore.push(rec);
    res.status(201).json(rec);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/production-rules/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const idx = rulesStore.findIndex((r) => r.id === id);
  if (idx === -1) return res.status(404).json({ error: 'rule not found' });
  const b = req.body || {};
  rulesStore[idx] = {
    ...rulesStore[idx],
    ...b,
    id,
    capacity_per_hour: b.capacity_per_hour != null ? Number(b.capacity_per_hour) : rulesStore[idx].capacity_per_hour,
    changeover_minutes: b.changeover_minutes != null ? Number(b.changeover_minutes) : rulesStore[idx].changeover_minutes,
    updated_at: new Date().toISOString(),
  };
  res.json(rulesStore[idx]);
});

router.delete('/production-rules/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const idx = rulesStore.findIndex((r) => r.id === id);
  if (idx === -1) return res.status(404).json({ error: 'rule not found' });
  const [removed] = rulesStore.splice(idx, 1);
  res.json({ ok: true, removed });
});

// ----- minimal PDF builder (no deps) -----
function buildSimplePdf(textLines) {
  // Escape parens/backslashes for PDF strings
  const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  let stream = 'BT\n/F1 11 Tf\n14 TL\n50 770 Td\n';
  textLines.forEach((line, i) => {
    if (i === 0) stream += `(${esc(line)}) Tj\n`;
    else stream += `T*\n(${esc(line)}) Tj\n`;
  });
  stream += 'ET\n';
  const streamBytes = Buffer.from(stream, 'latin1');

  const objects = [];
  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  objects.push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  objects.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>');
  objects.push(`<< /Length ${streamBytes.length} >>\nstream\n${stream}endstream`);
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>');

  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  offsets.forEach((o) => {
    pdf += `${String(o).padStart(10, '0')} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, 'latin1');
}

module.exports = router;
