import React, { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Activity, Shield, FileText, QrCode } from 'lucide-react';
import { supabase } from '../lib/supabase';

const Home = () => {
    const navigate = useNavigate();

    useEffect(() => {
        // If user lands here after clicking email link (or is already logged in)
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) {
                navigate('/dashboard');
            }
        });
    }, [navigate]);

    return (
        <div className="home-container" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
            {/* Navigation */}
            <nav style={{ display: 'flex', justifyContent: 'space-between', padding: '1.5rem', alignItems: 'center', background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 'bold', fontSize: '1.25rem', color: 'var(--color-primary)' }}>
                    <Activity size={24} />
                    Health Vault
                </div>
                <div style={{ display: 'flex', gap: '1rem' }}>
                    <Link to="/auth" className="btn btn-outline">Login</Link>
                    <Link to="/auth" className="btn btn-primary">Sign Up</Link>
                </div>
            </nav>

            {/* Hero Section */}
            <main style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem 2rem', textAlign: 'center' }}>
                <div style={{ maxWidth: '800px' }} className="animate-fade-in">
                    <h1 style={{ fontSize: '3rem', marginBottom: '1.5rem', color: 'var(--color-text-main)', lineHeight: '1.2' }}>
                        Your Health, <span style={{ color: 'var(--color-primary)' }}>Your Control.</span>
                    </h1>
                    <p style={{ fontSize: '1.25rem', color: 'var(--color-text-muted)', marginBottom: '3rem' }}>
                        A secure personal medical record platform. Upload reports, extract health metrics using AI, visualize your trends, and share secure access in emergencies.
                    </p>

                    <div style={{ display: 'flex', gap: '1.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                        <Link to="/auth" className="btn btn-primary" style={{ fontSize: '1.125rem', padding: '0.75rem 2rem' }}>
                            Get Started for Free
                        </Link>
                    </div>
                </div>

                {/* Feature Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '2rem', marginTop: '5rem', maxWidth: '1000px', width: '100%' }}>
                    <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                        <div style={{ background: 'var(--color-bg-light)', padding: '1rem', borderRadius: 'var(--radius-xl)', color: 'var(--color-primary)', marginBottom: '1rem' }}>
                            <FileText size={32} />
                        </div>
                        <h3>Upload Reports</h3>
                        <p className="text-muted" style={{ marginTop: '0.5rem' }}>Securely store PDFs and images of your clinical results.</p>
                    </div>

                    <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                        <div style={{ background: 'var(--color-bg-light)', padding: '1rem', borderRadius: 'var(--radius-xl)', color: 'var(--color-primary)', marginBottom: '1rem' }}>
                            <Activity size={32} />
                        </div>
                        <h3>AI Insights</h3>
                        <p className="text-muted" style={{ marginTop: '0.5rem' }}>Extract metrics automatically and view your health trends globally.</p>
                    </div>

                    <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                        <div style={{ background: 'var(--color-bg-light)', padding: '1rem', borderRadius: 'var(--radius-xl)', color: 'var(--color-primary)', marginBottom: '1rem' }}>
                            <QrCode size={32} />
                        </div>
                        <h3>Emergency Access</h3>
                        <p className="text-muted" style={{ marginTop: '0.5rem' }}>Generate a QR code linking to your vital details for paramedics.</p>
                    </div>

                    <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                        <div style={{ background: 'var(--color-bg-light)', padding: '1rem', borderRadius: 'var(--radius-xl)', color: 'var(--color-primary)', marginBottom: '1rem' }}>
                            <Shield size={32} />
                        </div>
                        <h3>Bank-level Security</h3>
                        <p className="text-muted" style={{ marginTop: '0.5rem' }}>Encrypted storage and strict row-level security on your data.</p>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default Home;
