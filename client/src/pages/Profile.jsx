import React, { useState, useEffect } from 'react';
import Sidebar from '../components/Sidebar';
import { supabase } from '../lib/supabase';
import { QRCodeCanvas } from 'qrcode.react';
import { User, Phone, Droplet, Hash, Settings as SettingsIcon, Loader, RefreshCw, Trash2, Clock, Copy, Check, Share2, Sun, Moon } from 'lucide-react';
import { useHealth } from '../contexts/HealthContext';

const Profile = () => {
    const [profile, setProfile] = useState({
        name: '',
        dob: '',
        blood_group: '',
        emergency_contact: ''
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    
    // Global Theme State
    const { theme, toggleTheme } = useHealth();
    
    // Emergency QR State
    const [emergencyToken, setEmergencyToken] = useState(null);
    const [expiresAt, setExpiresAt] = useState(null);
    const [emergencyNetworkUrl, setEmergencyNetworkUrl] = useState(null);
    const [duration, setDuration] = useState(24);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isCopied, setIsCopied] = useState(false);

    useEffect(() => {
        const fetchUserData = async () => {
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (user) {
                    const { data: userRow } = await supabase.from('users').select('*').eq('id', user.id).single();
                    if (userRow) {
                        setProfile({
                            name: userRow.name || user.user_metadata?.name || 'Authorized User',
                            dob: userRow.dob || '',
                            blood_group: userRow.blood_group || '',
                            emergency_contact: userRow.emergency_contact || ''
                        });
                    } else {
                        setProfile(prev => ({
                            ...prev,
                            name: user.user_metadata?.name || 'Authorized User'
                        }));
                    }

                    // Also fetch current emergency token from backend
                    try {
                        const { data: { session } } = await supabase.auth.getSession();
                        const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
                        
                        const tokenRes = await fetch(`${apiUrl}/emergency/current-token`, {
                            headers: { 'Authorization': `Bearer ${session?.access_token}` }
                        });
                        if (tokenRes.ok) {
                            const tokenData = await tokenRes.json();
                            if (tokenData && tokenData.token) {
                                // Check if actually expired
                                const exp = new Date(tokenData.expires_at);
                                if (exp > new Date()) {
                                    setEmergencyToken(tokenData.token);
                                    setExpiresAt(tokenData.expires_at);
                                    setEmergencyNetworkUrl(tokenData.network_url);
                                }
                            }
                        }
                    } catch (err) {
                        console.error("Failed to fetch existing emergency token:", err);
                    }
                }
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        fetchUserData();
    }, []);

    // Timer to automatically expire QR code in UI
    useEffect(() => {
        if (!expiresAt) return;
        
        const interval = setInterval(() => {
            const now = new Date();
            const exp = new Date(expiresAt);
            if (now >= exp) {
                console.log("DEBUG: QR Code has expired. Hiding from UI.");
                setEmergencyToken(null);
                setExpiresAt(null);
                setEmergencyNetworkUrl(null);
                clearInterval(interval);
            }
        }, 10000); // Check every 10 seconds
        
        return () => clearInterval(interval);
    }, [expiresAt]);

    const handleSaveProfile = async () => {
        setSaving(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                const { error } = await supabase
                    .from('users')
                    .update({
                        name: profile.name,
                        dob: profile.dob || null,
                        blood_group: profile.blood_group,
                        emergency_contact: profile.emergency_contact
                    })
                    .eq('id', user.id);
                if (error) throw error;
                alert('Profile updated successfully!');
            }
        } catch (error) {
            console.error(error);
            alert('Failed to update profile: ' + error.message);
        } finally {
            setSaving(false);
        }
    };

    const handleGenerateQR = async () => {
        setIsGenerating(true);
        try {
            const { data: sessionData } = await supabase.auth.getSession();
            const token = sessionData?.session?.access_token;
            if (!token) return;

            const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
            const res = await fetch(`${apiUrl}/emergency/generate-emergency`, {
                method: 'POST',
                headers: { 
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ duration_hours: duration })
            });

            if (res.ok) {
                const json = await res.json();
                setEmergencyToken(json.token);
                setExpiresAt(json.expires_at);
                setEmergencyNetworkUrl(json.network_url);
            } else {
                const errorData = await res.json();
                alert(`Failed to generate emergency token: ${errorData.error || 'Unknown error'}`);
            }
        } catch (e) {
            console.error(e);
            alert('Error generating QR code.');
        } finally {
            setIsGenerating(false);
        }
    };

    const handleRevokeQR = async () => {
        if (!window.confirm('Are you sure you want to delete this emergency QR code? Paramedics will no longer be able to scan it.')) return;
        
        setIsGenerating(true);
        try {
            const { data: sessionData } = await supabase.auth.getSession();
            const token = sessionData?.session?.access_token;
            if (!token) return;

            const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
            const res = await fetch(`${apiUrl}/emergency/revoke-emergency`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (res.ok) {
                setEmergencyToken(null);
                setExpiresAt(null);
                setEmergencyNetworkUrl(null);
            } else {
                alert('Failed to revoke token.');
            }
        } catch (e) {
            console.error(e);
            alert('Error revoking token.');
        } finally {
            setIsGenerating(false);
        }
    };

    const handleCopyUrl = async () => {
        if (!emergencyNetworkUrl) return;
        
        try {
            await navigator.clipboard.writeText(emergencyNetworkUrl);
            setIsCopied(true);
            setTimeout(() => setIsCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy: ', err);
        }
    };

    const handleShareUrl = async () => {
        if (!emergencyNetworkUrl) return;
        
        const title = "My Medical Emergency Snapshot";
        const text = `Access my secure medical snapshot.\nLink: ${emergencyNetworkUrl}`;
        
        try {
            const qrCanvas = document.getElementById('qr-code-canvas');
            const mainCanvas = document.createElement('canvas');
            const ctx = mainCanvas.getContext('2d');

            mainCanvas.width = 400;
            mainCanvas.height = 460;

            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, mainCanvas.width, mainCanvas.height);

            if (qrCanvas) {
                ctx.drawImage(qrCanvas, 76, 40, 248, 248);
            }

            ctx.fillStyle = '#1e293b';
            ctx.font = 'bold 20px -apple-system, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Emergency Medical ID', 200, 340);

            ctx.fillStyle = '#64748b';
            ctx.font = '14px -apple-system, sans-serif';
            ctx.fillText(profile.name || 'Patient', 200, 365);
            ctx.fillText(`Expires: ${new Date(expiresAt).toLocaleString()}`, 200, 390);

            mainCanvas.toBlob(async (blob) => {
                const fullUrl = emergencyNetworkUrl;
                if (!blob) return fallbackShare(title, text, fullUrl);
                
                try {
                    // Try to share the file directly if supported (more mobile-friendly)
                    if (navigator.share && navigator.canShare && navigator.canShare({ files: [new File([blob], "medical-id.png", { type: "image/png" })] })) {
                        const file = new File([blob], "medical-id.png", { type: "image/png" });
                        await navigator.share({
                            files: [file],
                            title: title,
                            text: text
                        });
                    } else {
                        // Fallback to clipboard for laptop users
                        const item = new ClipboardItem({ 'image/png': blob });
                        await navigator.clipboard.write([item]);
                        alert('QR Code image securely copied to your clipboard!');
                    }
                } catch (err) {
                    console.error('Sharing failed:', err);
                    fallbackShare(title, text, fullUrl);
                }
            }, 'image/png');
        } catch (e) {
            fallbackShare(title, text, emergencyNetworkUrl);
        }
    };

    const fallbackShare = async (title, text, url) => {
        if (navigator.share) {
            try {
                await navigator.share({ title, text, url });
            } catch (err) {
                console.error("Error sharing text", err);
            }
        } else {
            handleCopyUrl();
        }
    };


    return (
        <div className="app-layout animate-fade-slide-up">
            <Sidebar />
            <main className="main-content">
                <header style={{ marginBottom: '3rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                        <h1 style={{ fontWeight: '700', letterSpacing: '-0.02em', marginBottom: '0.25rem' }}>Profile & Emergency Wallet</h1>
                        <p className="text-muted" style={{ fontSize: '1rem' }}>Manage your personal details and secure emergency access.</p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 1rem', background: 'var(--color-bg-light)', borderRadius: 'var(--radius-pill)', border: '1px solid var(--color-border)' }}>
                        <span style={{ fontSize: '0.875rem', fontWeight: '500', color: 'var(--color-text-muted)' }}>Theme</span>
                        <button onClick={toggleTheme} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-surface)', width: '36px', height: '36px', borderRadius: '50%', boxShadow: 'var(--shadow-sm)', color: 'var(--color-primary)' }}>
                            {theme === 'dark' ? <Moon size={18} /> : <Sun size={18} />}
                        </button>
                    </div>
                </header>

                <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>

                    {loading ? (
                        <div style={{ padding: '2rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-text-muted)' }}>
                            <Loader className="animate-spin" /> Loading your profile...
                        </div>
                    ) : (
                        <>
                            {/* Editable Details Form */}
                            <div className="card" style={{ flex: '2', minWidth: '300px', padding: '2rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '2rem' }}>
                                    <SettingsIcon color="var(--color-primary)" />
                                    <h2 style={{ fontSize: '1.25rem' }}>Personal Information</h2>
                                </div>

                                <form style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                    <div>
                                        <label className="label">Full Name</label>
                                        <input type="text" className="input-field" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
                                    </div>

                                    <div style={{ display: 'flex', gap: '1rem' }}>
                                        <div style={{ flex: 1 }}>
                                            <label className="label">Date of Birth</label>
                                            <input type="date" className="input-field" value={profile.dob} onChange={(e) => setProfile({ ...profile, dob: e.target.value })} />
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <label className="label">Blood Group</label>
                                            <input type="text" className="input-field" value={profile.blood_group} onChange={(e) => setProfile({ ...profile, blood_group: e.target.value })} />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="label">Emergency Contact Phone</label>
                                        <input type="tel" className="input-field" value={profile.emergency_contact} onChange={(e) => setProfile({ ...profile, emergency_contact: e.target.value })} />
                                    </div>

                                    <button type="button" onClick={handleSaveProfile} disabled={saving} className="btn btn-primary" style={{ alignSelf: 'flex-start', marginTop: '1rem' }}>
                                        {saving ? 'Saving...' : 'Save Changes'}
                                    </button>
                                </form>
                            </div>

                            {/* Emergency Wallet View */}
                            <div className="card" style={{ flex: '1', minWidth: '350px', background: 'var(--color-primary-gradient)', color: 'white', position: 'relative', padding: '2rem' }}>
                                <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    Medical ID Card
                                    {emergencyToken && <Trash2 size={18} style={{ cursor: 'pointer', opacity: 0.8 }} onClick={handleRevokeQR} />}
                                </h2>

                                {emergencyToken ? (
                                    <div className="pulse-glow" style={{ background: 'var(--color-surface)', padding: '2rem 1.5rem', borderRadius: 'var(--radius-xl)', color: 'var(--color-text-main)', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', border: '1px solid rgba(37,99,235,0.2)' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', background: 'white', padding: '1rem', borderRadius: '12px' }}>
                                            <QRCodeCanvas id="qr-code-canvas" value={emergencyNetworkUrl || ''} size={150} level={"H"} />
                                        </div>
                                        
                                        <button 
                                            onClick={handleShareUrl} 
                                            className="btn btn-primary"
                                            style={{ 
                                                marginTop: '1.5rem', 
                                                width: '100%', 
                                                display: 'flex', 
                                                justifyContent: 'center', 
                                                alignItems: 'center',
                                                gap: '0.5rem',
                                                boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)'
                                            }}
                                        >
                                            <Share2 size={16} /> Share QR Code & Link
                                        </button>
                                        
                                        <div style={{ marginTop: '1rem', width: '100%' }}>
                                            <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>Paramedic Scan URL:</p>
                                            <div style={{ 
                                                display: 'flex', 
                                                alignItems: 'center', 
                                                background: 'var(--color-bg-light)', 
                                                border: '1px solid var(--color-border)', 
                                                borderRadius: 'var(--radius-md)', 
                                                padding: '0.5rem',
                                                gap: '0.5rem'
                                            }}>
                                                <input 
                                                    type="text" 
                                                    readOnly 
                                                    value={emergencyNetworkUrl || ''}
                                                    style={{ 
                                                        flex: 1, 
                                                        background: 'transparent', 
                                                        border: 'none', 
                                                        fontSize: '0.75rem', 
                                                        color: 'var(--color-text-main)',
                                                        outline: 'none',
                                                        textOverflow: 'ellipsis'
                                                    }} 
                                                />
                                                <button 
                                                    onClick={handleCopyUrl} 
                                                    style={{ 
                                                        background: 'white', 
                                                        border: '1px solid var(--color-border)', 
                                                        borderRadius: '4px', 
                                                        padding: '0.25rem 0.6rem', 
                                                        cursor: 'pointer',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center'
                                                    }}
                                                    title="Copy URL"
                                                >
                                                    {isCopied ? <Check size={16} color="var(--color-success)" /> : <Copy size={16} color="var(--color-text-muted)" />}
                                                </button>
                                            </div>
                                        </div>

                                        {expiresAt && (
                                            <div style={{ marginTop: '1rem', fontSize: '0.85rem', color: 'var(--color-danger)', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                <Clock size={14} /> Expires: {new Date(expiresAt).toLocaleString()}
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="glass-panel" style={{ padding: '2rem', borderRadius: 'var(--radius-lg)', textAlign: 'center', color: 'var(--color-text-main)' }}>
                                        <p style={{ marginBottom: '1.5rem', fontSize: '0.95rem' }}>No active emergency QR code. Generate one for paramedics to access your vitals.</p>
                                        
                                        <div style={{ marginBottom: '1.5rem', textAlign: 'left' }}>
                                            <label className="label">Access Duration</label>
                                            <select className="input-field" style={{ background: 'white', color: 'black' }} value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
                                                <option value={5}>5 Hours (Short Term)</option>
                                                <option value={10}>10 Hours</option>
                                                <option value={24}>24 Hours (Standard)</option>
                                                <option value={48}>48 Hours</option>
                                                <option value={168}>1 Week (Emergency Travel)</option>
                                            </select>
                                        </div>

                                        <button onClick={handleGenerateQR} disabled={isGenerating} className="btn" style={{ width: '100%', background: 'white', color: 'var(--color-primary)', fontWeight: 'bold' }}>
                                            {isGenerating ? <Loader className="animate-spin" size={16} /> : 'Generate Secure QR'}
                                        </button>
                                    </div>
                                )}

                                <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        <User size={18} opacity={0.9} /> <span style={{ fontWeight: '600', fontSize: '1.1rem' }}>{profile.name}</span>
                                    </div>
                                    <div style={{ display: 'flex', gap: '2rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <Droplet size={18} opacity={0.9} /> <span style={{ fontWeight: '500' }}>{profile.blood_group || 'N/A'}</span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <Phone size={18} opacity={0.9} /> <span style={{ fontWeight: '500' }}>{profile.emergency_contact || 'None'}</span>
                                        </div>
                                    </div>
                                </div>

                                {emergencyToken && (
                                    <button 
                                        onClick={handleGenerateQR} 
                                        disabled={isGenerating} 
                                        className="btn" 
                                        style={{ width: '100%', marginTop: '2rem', background: 'rgba(255,255,255,0.2)', color: 'white', border: '1px solid rgba(255,255,255,0.3)' }}
                                    >
                                        <RefreshCw size={14} style={{ marginRight: '0.5rem' }} /> Regenerate / Extend
                                    </button>
                                )}
                            </div>
                        </>
                    )}

                </div>
            </main>
        </div>
    );
};

export default Profile;
