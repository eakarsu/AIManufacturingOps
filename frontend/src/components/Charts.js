import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const API_URL = 'http://localhost:3001/api';

const COLORS = ['#6366f1', '#8b5cf6', '#a855f7', '#ec4899', '#f43f5e', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6', '#60a5fa'];
const SEVERITY_COLORS = { low: '#4ade80', medium: '#fbbf24', high: '#fb923c', critical: '#f87171' };
const STATUS_COLORS = { operational:'#4ade80', running:'#4ade80', active:'#60a5fa', warning:'#fbbf24', critical:'#f87171', stopped:'#9ca3af', pending:'#fbbf24', completed:'#4ade80', in_transit:'#60a5fa', delivered:'#4ade80', customs:'#a78bfa', processing:'#38bdf8', maintenance:'#818cf8' };

const Charts = () => {
  const [equipment, setEquipment] = useState([]);
  const [assembly, setAssembly] = useState([]);
  const [safety, setSafety] = useState([]);
  const [supply, setSupply] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [eq, as, sa, su, ro] = await Promise.all([
          axios.get(`${API_URL}/equipment`), axios.get(`${API_URL}/assembly`),
          axios.get(`${API_URL}/safety`), axios.get(`${API_URL}/supply-chain`), axios.get(`${API_URL}/routes`)
        ]);
        setEquipment(eq.data.data || eq.data);
        setAssembly(as.data.data || as.data);
        setSafety(sa.data.data || sa.data);
        setSupply(su.data.data || su.data);
        setRoutes(ro.data.data || ro.data);
      } catch (e) { console.error('Failed to load chart data'); }
      setLoading(false);
    };
    fetchAll();
  }, []);

  if (loading) return <div className="ai-loading"><div className="spinner"></div><p>Loading charts...</p></div>;

  // Process data
  const equipFailure = equipment.map(e => ({ name: e.name.length > 15 ? e.name.substring(0,15)+'...' : e.name, probability: parseFloat(e.failure_probability) })).sort((a,b) => b.probability - a.probability).slice(0, 10);

  const assemblyEff = assembly.map(a => ({ name: a.name, efficiency: parseFloat(a.efficiency), output: a.current_output, capacity: a.capacity }));

  const severityCounts = {};
  safety.forEach(s => { severityCounts[s.severity] = (severityCounts[s.severity]||0) + 1; });
  const safetyData = Object.entries(severityCounts).map(([name, value]) => ({ name, value }));

  const supplyStatusCounts = {};
  supply.forEach(s => { supplyStatusCounts[s.status] = (supplyStatusCounts[s.status]||0) + 1; });
  const supplyData = Object.entries(supplyStatusCounts).map(([name, value]) => ({ name: name.replace('_',' '), value }));

  const routeStatusCounts = {};
  routes.forEach(r => { routeStatusCounts[r.status] = (routeStatusCounts[r.status]||0) + 1; });
  const routeData = Object.entries(routeStatusCounts).map(([name, value]) => ({ name, value }));

  const tooltipStyle = { backgroundColor: '#1e1e3f', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#e4e4e7' };

  return (
    <div>
      <h2 style={{marginBottom:'24px'}}>Charts & Analytics</h2>

      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'24px'}}>
        <div className="data-section" style={{gridColumn:'span 2'}}>
          <div className="section-header"><h3>Equipment Failure Probability (Top 10)</h3></div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={equipFailure}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
              <XAxis dataKey="name" tick={{fill:'#9ca3af', fontSize:11}} angle={-20} textAnchor="end" height={60} />
              <YAxis tick={{fill:'#9ca3af'}} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="probability" fill="#f87171" radius={[4,4,0,0]} name="Failure %" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="data-section" style={{gridColumn:'span 2'}}>
          <div className="section-header"><h3>Assembly Line Efficiency</h3></div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={assemblyEff}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
              <XAxis dataKey="name" tick={{fill:'#9ca3af', fontSize:11}} angle={-20} textAnchor="end" height={60} />
              <YAxis tick={{fill:'#9ca3af'}} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend />
              <Bar dataKey="efficiency" fill="#6366f1" radius={[4,4,0,0]} name="Efficiency %" />
              <Bar dataKey="output" fill="#22c55e" radius={[4,4,0,0]} name="Output" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="data-section">
          <div className="section-header"><h3>Safety Incident Severity</h3></div>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={safetyData} cx="50%" cy="50%" outerRadius={100} fill="#8884d8" dataKey="value" label={({name,value})=>`${name}: ${value}`}>
                {safetyData.map((entry, i) => <Cell key={i} fill={SEVERITY_COLORS[entry.name] || COLORS[i]} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="data-section">
          <div className="section-header"><h3>Supply Chain Status</h3></div>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={supplyData} cx="50%" cy="50%" outerRadius={100} fill="#8884d8" dataKey="value" label={({name,value})=>`${name}: ${value}`}>
                {supplyData.map((entry, i) => <Cell key={i} fill={STATUS_COLORS[entry.name.replace(' ','_')] || COLORS[i]} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="data-section">
          <div className="section-header"><h3>Route Status Distribution</h3></div>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={routeData} cx="50%" cy="50%" outerRadius={100} fill="#8884d8" dataKey="value" label={({name,value})=>`${name}: ${value}`}>
                {routeData.map((entry, i) => <Cell key={i} fill={STATUS_COLORS[entry.name] || COLORS[i]} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default Charts;
