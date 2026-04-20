import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Activity, Phone, AlertTriangle, Loader } from 'lucide-react';

const EmergencyView = () => {
    const { token } = useParams();
    const [patientData, setPatientData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchEmergencyData = async () => {
            try {
                const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
                const res = await fetch(`${apiUrl}/emergency/${token}`);
                const json = await res.json();

                if (res.ok && json.patient) {
                    setPatientData(json.patient);
                } else {
                    setError('Invalid or expired emergency token.');
                }
            } catch (e) {
                setError('Failed to load emergency data.');
                console.error(e);
            } finally {
                setLoading(false);
            }
        };

        if (token) {
            fetchEmergencyData();
        }
    }, [token]);

    return (
        <div style={{ minHeight: '100vh', padding: '1.5rem', background: '#ffe4e6' }}>
            <div className="container" style={{ maxWidth: '800px', margin: '0 auto' }}>

                {loading ? (
                    <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--color-danger)' }}>
                        <Loader className="animate-spin" style={{ margin: '0 auto', marginBottom: '1rem', width: '48px', height: '48px' }} />
                        <h2>Verifying Emergency Access...</h2>
                    </div>
                ) : error ? (
                    <div className="card" style={{ textAlign: 'center', color: 'var(--color-danger)' }}>
                        <AlertTriangle style={{ margin: '0 auto', marginBottom: '1rem', width: '48px', height: '48px' }} />
                        <h2>{error}</h2>
                        <p style={{ color: 'var(--color-text-main)', marginTop: '1rem' }}>Access denied. This token may have expired or does not exist.</p>
                    </div>
                ) : (
                    <>
                        <div className="card" style={{ borderTop: '5px solid var(--color-danger)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--color-border)', paddingBottom: '1.5rem', marginBottom: '1.5rem' }}>
                                <div>
                                    <h1 style={{ color: 'var(--color-danger)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        <AlertTriangle /> EMERGENCY ACCESS
                                    </h1>
                                    <p style={{ marginTop: '0.5rem', color: 'var(--color-text-main)', fontSize: '1.125rem' }}>Patient: <strong>{patientData?.name || 'Unknown Patient'}</strong></p>
                                </div>
                                <div style={{ textAlign: 'right', background: 'var(--color-bg-light)', padding: '0.75rem', borderRadius: 'var(--radius-md)' }}>
                                    <div style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>Blood Group</div>
                                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--color-danger)' }}>{patientData?.blood_group || 'Unknown'}</div>
                                </div>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginBottom: '1.5rem' }}>
                                <div style={{ background: '#fef2f2', padding: '1rem', borderRadius: 'var(--radius-md)' }}>
                                    <h3 style={{ color: 'var(--color-danger)', fontSize: '1rem', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <AlertTriangle size={18} /> Critical AI Insights
                                    </h3>
                                    <div style={{ color: 'var(--color-text-main)' }}>
                                        {patientData?.critical_insights?.length > 0 ? (
                                            <ul style={{ paddingLeft: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                {patientData.critical_insights.map((insight, i) => (
                                                    <li key={i} style={{ lineHeight: '1.4' }}>{insight.text}</li>
                                                ))}
                                            </ul>
                                        ) : (
                                            <p className="text-muted">No critical conditions detected in recent records.</p>
                                        )}
                                    </div>
                                </div>

                                <div style={{ background: 'var(--color-bg-light)', padding: '1rem', borderRadius: 'var(--radius-md)' }}>
                                    <h3 style={{ color: 'var(--color-primary)', fontSize: '1rem', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <Activity size={18} /> Medical Timeline (Recent Reports)
                                    </h3>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                        {patientData?.timeline?.length > 0 ? (
                                            patientData.timeline.map((item, i) => (
                                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem', background: 'white', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
                                                    <div style={{ fontWeight: '500', fontSize: '0.9rem' }}>{item.title}</div>
                                                    <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>{item.date}</div>
                                                </div>
                                            ))
                                        ) : (
                                            <p className="text-muted">No recent medical history found.</p>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div style={{ padding: '1rem', background: 'var(--color-bg-light)', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', gap: '1rem', border: '1px solid var(--color-border)' }}>
                                <Phone color="var(--color-primary)" />
                                <div>
                                    <div style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>Emergency Contact (ICE)</div>
                                    <div style={{ fontWeight: '600', fontSize: '1.1rem' }}>{patientData?.emergency_contact || 'None Provided'}</div>
                                </div>
                            </div>

                        </div>

                        <p style={{ textAlign: 'center', marginTop: '2rem', fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
                            This is a restricted, time-limited emergency medical view. Actions are logged. 
                            {patientData?.expires_at && (
                                <> Token expires: {new Date(patientData.expires_at).toLocaleString()}</>
                            )}
                        </p>
                    </>
                )}

            </div>
        </div>
    );
};

export default EmergencyView;
