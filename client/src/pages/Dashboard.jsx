import React, { useState, useEffect } from 'react';
import Sidebar from '../components/Sidebar';
import UploadModal from '../components/UploadModal';
import { useHealth } from '../contexts/HealthContext';
import { supabase } from '../lib/supabase';
import { Upload, FileText, Search, Plus, Loader, Trash, ShieldCheck } from 'lucide-react';

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

const Dashboard = () => {
    const { records, recordsLoading: loading, fetchRecords, fetchInsights, deleteRecord, insights, insightsLoading, setIsSummaryUpdating } = useHealth();
    const [showUploadModal, setShowUploadModal] = useState(false);

    // Derive Vitals from insights
    const chartData = insights?.chart_data || [];
    const latestMetrics = chartData.length > 0 ? chartData[chartData.length - 1] : {};

    const handleDelete = async (record) => {
        if (window.confirm(`Are you sure you want to delete "${record.title}"? This cannot be undone.`)) {
            const success = await deleteRecord(record.id);
            if (!success) {
                alert("Failed to delete record. Please try again.");
            }
        }
    };

    const handleUploadSuccess = () => {
        setShowUploadModal(false);
        fetchRecords(true); // Force refresh data after upload
        
        // Notify the app that summary is generating in the background
        setIsSummaryUpdating(true);
        
        // Refresh insights after 5 seconds to give the backend time to generate the global summary
        setTimeout(() => {
            fetchInsights(true);
            setIsSummaryUpdating(false);
        }, 5000);
    };

    const handleUploadClose = () => {
        setShowUploadModal(false);
    };

    return (
        <>
            <div className="app-layout animate-fade-slide-up">
                <Sidebar />
                <main className="main-content">
                    <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3rem' }}>
                        <div>
                            <h1 style={{ fontWeight: '700', letterSpacing: '-0.02em', marginBottom: '0.25rem' }}>Dashboard</h1>
                            <p className="text-muted" style={{ fontSize: '1rem' }}>Welcome back. Here is your health overview.</p>
                        </div>
                        <button className="btn btn-primary" onClick={() => setShowUploadModal(true)}>
                            <Upload size={18} /> Upload Report
                        </button>
                    </header>

                    {/* Quick Stats Strip */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.5rem', marginBottom: '3rem' }}>
                        {loading || insightsLoading ? (
                            <>
                                <div className="card skeleton" style={{ height: '120px' }}></div>
                                <div className="card skeleton" style={{ height: '120px' }}></div>
                                <div className="card skeleton" style={{ height: '120px' }}></div>
                            </>
                        ) : (
                            <>
                                <div className="card" style={{ display: 'flex', flexDirection: 'column', padding: '1.5rem 1.75rem' }}>
                                    <h3 className="text-muted" style={{ fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Reports</h3>
                                    <div style={{ fontSize: '2.5rem', fontWeight: '700', color: 'var(--color-primary)', marginTop: 'auto' }}>{records.length}</div>
                                </div>
                                <div className="card" style={{ display: 'flex', flexDirection: 'column', padding: '1.5rem 1.75rem' }}>
                                    <h3 className="text-muted" style={{ fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Weight Trend</h3>
                                    <div style={{ fontSize: '2.5rem', fontWeight: '700', marginTop: 'auto', display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                                        {latestMetrics.Weight || '--'} <span style={{ fontSize: '1rem', color: 'var(--color-text-muted)' }}>kg</span>
                                    </div>
                                </div>
                                <div className="card" style={{ display: 'flex', flexDirection: 'column', padding: '1.5rem 1.75rem' }}>
                                    <h3 className="text-muted" style={{ fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Hemoglobin Level</h3>
                                    <div style={{ fontSize: '2.5rem', fontWeight: '700', marginTop: 'auto', display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                                        {latestMetrics.Hemoglobin || '--'} <span style={{ fontSize: '1rem', color: 'var(--color-text-muted)' }}>g/dL</span>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>

                    {/* Recent Timeline Preview */}
                    <div className="card" style={{ padding: '2rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem' }}>
                            <h2 style={{ fontSize: '1.5rem' }}>Recent Timeline</h2>
                            <button className="btn btn-outline" style={{ padding: '0.4rem 1rem', fontSize: '0.85rem' }} onClick={() => fetchRecords(true)}>Refresh Activity</button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', marginLeft: '0.5rem' }}>
                            {loading ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', paddingLeft: '1.5rem' }}>
                                    <div className="skeleton" style={{ height: '80px', width: '100%' }}></div>
                                    <div className="skeleton" style={{ height: '80px', width: '100%' }}></div>
                                    <div className="skeleton" style={{ height: '80px', width: '100%' }}></div>
                                </div>
                            ) : records.length === 0 ? (
                                <div style={{ padding: '3rem 2rem', textAlign: 'center', background: 'var(--color-bg-light)', borderRadius: 'var(--radius-md)', color: 'var(--color-text-muted)', border: '1px dashed var(--color-border)' }}>
                                    <FileText size={48} style={{ margin: '0 auto', marginBottom: '1rem', opacity: 0.5 }} />
                                    <p>No records found. Tap the plus button below to upload your first medical report.</p>
                                </div>
                            ) : (
                                records.slice(0, 5).map(record => (
                                    <div key={record.id} className="timeline-item">
                                        <div className="timeline-dot"></div>
                                        <div style={{ padding: '1.25rem', background: 'var(--color-bg-light)', borderRadius: 'var(--radius-lg)', display: 'flex', gap: '1rem', alignItems: 'flex-start', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-sm)', transition: 'transform 0.2s', '&:hover': { transform: 'translateX(4px)' } }}>
                                            <div style={{ background: 'var(--color-surface)', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <FileText size={20} color="var(--color-primary)" />
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                    <h4 style={{ fontSize: '1.05rem', fontWeight: '600', color: 'var(--color-text-main)', marginBottom: '0.25rem' }}>{record.title}</h4>
                                                    <div className="text-muted" style={{ fontSize: '0.75rem', fontWeight: '500' }}>{record.date || record.created_at?.split('T')[0]}</div>
                                                </div>
                                                <p className="text-muted" style={{ fontSize: '0.85rem', margin: '0', lineHeight: '1.4' }}>{record.description || 'Processed by AI'}</p>

                                                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.8rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                                    <span style={{ fontSize: '0.7rem', fontWeight: '600', padding: '0.2rem 0.6rem', background: 'var(--color-primary-light)', color: 'var(--color-primary)', borderRadius: 'var(--radius-pill)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                        {record.type}
                                                    </span>
                                                    <ConfidenceBadge score={record.confidence_score} />
                                                    <button
                                                        onClick={() => handleDelete(record)}
                                                        title="Delete Record"
                                                        style={{
                                                            display: "inline-flex",
                                                            alignItems: "center",
                                                            justifyContent: "center",
                                                            padding: "6px",
                                                            marginLeft: "auto",
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
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                </main>
            </div>
            {/* Upload Modal */}
            <UploadModal isOpen={showUploadModal} onClose={handleUploadClose} onSuccess={handleUploadSuccess} />
        </>
    );
};

export default Dashboard;
