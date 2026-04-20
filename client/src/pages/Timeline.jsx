import React, { useState } from 'react';
import Sidebar from '../components/Sidebar';
import { useHealth } from '../contexts/HealthContext';
import { Search, Filter, Share2, FileText, Calendar, X, Loader, Trash, ShieldCheck } from 'lucide-react';

// Helper: renders a colour-coded AI confidence badge
const ConfidenceBadge = ({ score }) => {
    if (score === null || score === undefined) return null;
    const pct = Math.round(score * 100);
    let color, bg, label;
    if (pct >= 80) { color = '#16a34a'; bg = 'rgba(22,163,74,0.12)'; label = 'High'; }
    else if (pct >= 50) { color = '#d97706'; bg = 'rgba(217,119,6,0.12)'; label = 'Medium'; }
    else { color = '#dc2626'; bg = 'rgba(220,38,38,0.12)'; label = 'Low'; }
    return (
        <span title={`AI Confidence: ${pct}%`} style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
            fontSize: '0.7rem', fontWeight: '600',
            padding: '0.2rem 0.55rem',
            background: bg, color,
            borderRadius: 'var(--radius-pill)',
            border: `1px solid ${color}33`,
            letterSpacing: '0.03em',
            whiteSpace: 'nowrap'
        }}>
            <ShieldCheck size={11} />
            {pct}% {label}
        </span>
    );
};

const Timeline = () => {
    const [search, setSearch] = useState("");
    const [filterType, setFilterType] = useState("all");
    const { records, recordsLoading: loading, deleteRecord } = useHealth();

    const handleDelete = async (record) => {
        if (window.confirm(`Are you sure you want to delete "${record.title}"? This cannot be undone.`)) {
            const success = await deleteRecord(record.id);
            if (!success) {
                alert("Failed to delete record. Please try again.");
            }
        }
    };

    // Filter logic
    const filteredRecords = records.filter(item => {
        const matchesSearch = item.title?.toLowerCase().includes(search.toLowerCase()) ||
            item.description?.toLowerCase().includes(search.toLowerCase());
        const matchesType = filterType === 'all' || item.type === filterType;
        return matchesSearch && matchesType;
    });

    const handleViewReport = (url) => {
        if (!url) {
            alert("No file is attached to this report yet.");
            return;
        }
        window.open(url, '_blank');
    };

    const handleShareReport = (item) => {
        if (!item.file_url) {
            alert("Cannot share a report without a file attached.");
            return;
        }
        // Create a simple text summary to share
        const text = `Health Record: ${item.title}\nDate: ${item.date || item.created_at?.split('T')[0]}\nURL: ${item.file_url}`;
        navigator.clipboard.writeText(text).then(() => {
            alert("Secure sharing link copied to clipboard!");
        }).catch(() => {
            alert("Failed to copy link. Please manually copy the URL from the View Report button.");
        });
    };

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <header style={{ marginBottom: '2rem' }}>
                    <h1>Health Timeline</h1>
                    <p className="text-muted">Your complete medical history in chronological order.</p>
                </header>

                {/* Search & Filter Bar */}
                <div className="card" style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, position: 'relative' }}>
                        <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
                        <input
                            type="text"
                            className="input-field"
                            placeholder="Search by doctor, hospital, or keyword..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            style={{ paddingLeft: '2.5rem' }}
                        />
                    </div>
                    <select
                        className="input-field"
                        style={{ width: 'auto', minWidth: '150px' }}
                        value={filterType}
                        onChange={(e) => setFilterType(e.target.value)}
                    >
                        <option value="all">All Types</option>
                        <option value="Lab">Lab Results</option>
                        <option value="Visit">Visits</option>
                        <option value="Prescription">Prescriptions</option>
                        <option value="Surgery">Surgery</option>
                    </select>
                </div>

                {/* Timeline View */}
                <div style={{ position: 'relative', marginLeft: '0.5rem', marginTop: '1rem' }}>
                    {loading ? (
                        <div style={{ padding: '2rem', marginLeft: '1.5rem', color: 'var(--color-text-muted)' }}>
                            <Loader className="animate-spin" style={{ marginBottom: '0.5rem' }} /> Loading timeline...
                        </div>
                    ) : filteredRecords.length === 0 ? (
                        <div style={{ padding: '3rem 2rem', textAlign: 'center', background: 'var(--color-bg-light)', borderRadius: 'var(--radius-md)', color: 'var(--color-text-muted)', border: '1px dashed var(--color-border)' }}>
                            No specific records found matching your filters.
                        </div>
                    ) : filteredRecords.map((item, idx) => (
                        <div key={item.id} className="timeline-item animate-fade-in" style={{ animationDelay: `${idx * 0.1}s` }}>
                            <div className="timeline-dot"></div>
                            <div style={{ padding: '1.25rem', background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', display: 'flex', flexDirection: 'column', gap: '1rem', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-sm)', transition: 'transform 0.2s', '&:hover': { transform: 'translateX(4px)' } }}>
                                
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                        <div style={{ background: 'var(--color-bg-light)', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <FileText size={22} color="var(--color-primary)" />
                                        </div>
                                        <div>
                                            <h3 style={{ fontSize: '1.1rem', fontWeight: '600', color: 'var(--color-text-main)', marginBottom: '0.2rem' }}>
                                                {item.title}
                                            </h3>
                                            <p className="text-muted" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', fontWeight: '500' }}>
                                                <Calendar size={12} /> {item.date || item.created_at?.split('T')[0]}
                                            </p>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                        <span style={{ fontSize: '0.7rem', fontWeight: '600', padding: '0.25rem 0.6rem', background: 'var(--color-primary-light)', color: 'var(--color-primary)', borderRadius: 'var(--radius-pill)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                            {item.type}
                                        </span>
                                        <ConfidenceBadge score={item.confidence_score} />
                                        <button
                                            onClick={() => handleDelete(item)}
                                            title="Delete Record"
                                            style={{
                                                display: "inline-flex",
                                                alignItems: "center",
                                                justifyContent: "center",
                                                padding: "6px",
                                                backgroundColor: "transparent",
                                                color: "var(--color-text-muted)",
                                                border: "none",
                                                borderRadius: "50%",
                                                cursor: "pointer",
                                                transition: "all 0.2s ease"
                                            }}
                                            onMouseEnter={(e) => {
                                                e.currentTarget.style.color = "var(--color-danger)";
                                                e.currentTarget.style.backgroundColor = "rgba(239, 68, 68, 0.1)";
                                            }}
                                            onMouseLeave={(e) => {
                                                e.currentTarget.style.color = "var(--color-text-muted)";
                                                e.currentTarget.style.backgroundColor = "transparent";
                                            }}
                                        >
                                            <Trash size={16} />
                                        </button>
                                    </div>
                                </div>

                                {item.description && (
                                    <div style={{ paddingLeft: '3.75rem' }}>
                                        <p style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)', margin: 0, lineHeight: 1.5 }}>{item.description}</p>
                                    </div>
                                )}

                                {(item.tags && item.tags.length > 0) && (
                                    <div style={{ display: 'flex', gap: '0.5rem', paddingLeft: '3.75rem' }}>
                                        {item.tags.map(tag => (
                                            <span key={tag} style={{ fontSize: '0.75rem', color: 'var(--color-primary)', background: 'var(--color-bg-light)', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
                                                #{tag}
                                            </span>
                                        ))}
                                    </div>
                                )}

                                <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', borderTop: '1px dashed var(--color-border)', paddingTop: '1.25rem' }}>
                                    <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => handleViewReport(item.file_url)}><FileText size={16} /> View Report</button>
                                    <button className="btn btn-outline" style={{ flex: 1, justifyContent: 'center' }} onClick={() => handleShareReport(item)}><Share2 size={16} /> Share Securely</button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </main>
        </div>
    );
};

export default Timeline;
