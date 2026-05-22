import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const API_URL = 'http://localhost:4103/api';

const Search = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const timerRef = useRef(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!query.trim()) { setResults(null); return; }
    timerRef.current = setTimeout(() => {
      searchGlobal(query);
    }, 300);
    return () => clearTimeout(timerRef.current);
  }, [query]);

  const searchGlobal = async (q) => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/search`, { params: { q } });
      setResults(res.data.results);
    } catch (e) { console.error('Search failed'); }
    setLoading(false);
  };

  const handleClick = (entityType, id) => {
    const pathMap = { equipment: '/equipment', routes: '/routes', safety: '/safety', assembly: '/assembly', 'supply-chain': '/supply-chain' };
    navigate(`${pathMap[entityType] || `/${entityType}`}/${id}`);
  };

  const sections = results ? [
    { key: 'equipment', label: 'Equipment', icon: '⚙️', data: results.equipment },
    { key: 'routes', label: 'Routes', icon: '🚚', data: results.routes },
    { key: 'safety', label: 'Safety Incidents', icon: '🛡️', data: results.safety },
    { key: 'assembly', label: 'Assembly Lines', icon: '🏭', data: results.assembly },
    { key: 'supplyChain', label: 'Supply Chain', icon: '📦', data: results.supplyChain },
  ] : [];

  const totalResults = sections.reduce((sum, s) => sum + (s.data?.length || 0), 0);

  return (
    <div>
      <h2 style={{marginBottom:'24px'}}>Global Search</h2>
      <div className="data-section" style={{marginBottom:'24px'}}>
        <input
          type="text"
          className="search-input-large"
          placeholder="Search across all equipment, routes, safety incidents, assembly lines, supply chain..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          autoFocus
        />
      </div>

      {loading && <div className="ai-loading"><div className="spinner"></div><p>Searching...</p></div>}

      {results && !loading && (
        totalResults === 0 ? (
          <div className="data-section"><div className="empty-state"><div className="icon">🔍</div><h3>No results found</h3><p>Try different search terms</p></div></div>
        ) : (
          sections.filter(s => s.data?.length > 0).map(section => (
            <div key={section.key} className="data-section" style={{marginBottom:'16px'}}>
              <div className="section-header"><h3>{section.icon} {section.label} ({section.data.length})</h3></div>
              <table className="data-table">
                <thead><tr><th>Name</th><th>Details</th><th>Status</th></tr></thead>
                <tbody>
                  {section.data.map(item => (
                    <tr key={item.id} onClick={() => handleClick(item.entity_type, item.id)}>
                      <td style={{fontWeight:500}}>{item.name}</td>
                      <td style={{color:'#9ca3af'}}>{item.subtitle}</td>
                      <td><span className={`status-badge status-${item.status}`}>{item.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))
        )
      )}
    </div>
  );
};

export default Search;
