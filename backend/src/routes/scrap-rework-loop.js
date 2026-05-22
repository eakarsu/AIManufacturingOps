const express = require('express');

const router = express.Router();

let loops = [
  { id: 1, cell: 'Line A final assembly', defectCode: 'TORQUE-LOW', scrapUnits: 14, reworkUnits: 22, disposition: 're-torque and inspect', owner: 'Quality lead', status: 'containment' },
  { id: 2, cell: 'Paint booth 2', defectCode: 'COAT-THIN', scrapUnits: 3, reworkUnits: 16, disposition: 'recoat queue', owner: 'Process engineer', status: 'rework' },
  { id: 3, cell: 'CNC cell 4', defectCode: 'DIM-OOS', scrapUnits: 9, reworkUnits: 4, disposition: 'tool offset review', owner: 'Manufacturing engineer', status: 'root cause' }
];

router.get('/', (req, res) => {
  const summary = loops.reduce((acc, item) => {
    acc.total += 1;
    acc.scrapUnits += Number(item.scrapUnits || 0);
    acc.reworkUnits += Number(item.reworkUnits || 0);
    return acc;
  }, { total: 0, scrapUnits: 0, reworkUnits: 0 });
  res.json({ loops, summary });
});

router.post('/', (req, res) => {
  const item = {
    id: Date.now(),
    cell: req.body.cell || 'Unassigned cell',
    defectCode: req.body.defectCode || 'DEFECT-PENDING',
    scrapUnits: Number(req.body.scrapUnits || 0),
    reworkUnits: Number(req.body.reworkUnits || 0),
    disposition: req.body.disposition || 'MRB review',
    owner: req.body.owner || 'Quality owner',
    status: req.body.status || 'containment'
  };
  loops = [item, ...loops];
  res.status(201).json(item);
});

module.exports = router;
