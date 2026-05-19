import React from 'react';
import ProductionThroughputChart from '../components/ProductionThroughputChart';
import DowntimeHeatmap from '../components/DowntimeHeatmap';
import ShiftReportPdf from '../components/ShiftReportPdf';
import ProductionRulesEditor from '../components/ProductionRulesEditor';

const CustomViewsPage = () => {
  return (
    <div style={{ padding: 24, background: '#0f172a', minHeight: '100vh' }}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ color: '#e2e8f0', margin: 0 }}>Manufacturing Custom Views</h1>
        <p style={{ color: '#94a3b8', marginTop: 4 }}>
          Specialized operational lenses: throughput, downtime, shift handoff, and capacity / changeover rules.
        </p>
      </div>
      <ProductionThroughputChart />
      <DowntimeHeatmap />
      <ShiftReportPdf />
      <ProductionRulesEditor />
    </div>
  );
};

export default CustomViewsPage;
