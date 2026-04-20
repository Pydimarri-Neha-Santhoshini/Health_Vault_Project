import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Activity, Clock, BarChart2, User, LogOut, ShieldAlert, LayoutDashboard } from 'lucide-react';

const Sidebar = () => {
    const navigate = useNavigate();

    const handleLogout = async () => {
        await supabase.auth.signOut();
        navigate('/');
    };

    const navItems = [
        { path: '/dashboard', icon: <LayoutDashboard size={20} />, label: 'Dashboard' },
        { path: '/timeline', icon: <Clock size={20} />, label: 'Timeline' },
        { path: '/insights', icon: <BarChart2 size={20} />, label: 'Insights' },
        { path: '/profile', icon: <User size={20} />, label: 'Profile' },
    ];

    return (
        <div style={{
            width: '280px',
            background: 'var(--color-surface)',
            borderRight: '1px solid var(--color-border)',
            display: 'flex',
            flexDirection: 'column',
            padding: '2rem 1.5rem',
            height: '100vh',
            position: 'sticky',
            top: 0,
            transition: 'background 0.3s, border-color 0.3s'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '3rem', color: 'var(--color-primary)' }}>
                <div style={{ background: 'var(--color-primary)', padding: '0.4rem', borderRadius: '8px', color: 'white', display: 'flex' }}>
                    <Activity size={24} strokeWidth={2.5} />
                </div>
                <h2 style={{ fontSize: '1.25rem', color: 'var(--color-text-main)', letterSpacing: '-0.5px' }}>Health Vault</h2>
            </div>

            <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1 }}>
                {navItems.map((item) => (
                    <NavLink
                        key={item.path}
                        to={item.path}
                        style={({ isActive }) => ({
                            display: 'flex',
                            alignItems: 'center',
                            gap: '1rem',
                            padding: '0.85rem 1.25rem',
                            borderRadius: 'var(--radius-pill)',
                            color: isActive ? 'var(--color-primary)' : 'var(--color-text-muted)',
                            background: isActive ? 'var(--color-bg-light)' : 'transparent',
                            fontWeight: isActive ? '600' : '500',
                            transition: 'all 0.2s',
                            textDecoration: 'none'
                        })}
                        onMouseEnter={(e) => {
                            if (e.target.style.background === 'transparent') {
                                e.target.style.background = 'var(--color-bg-main)';
                                e.target.style.transform = 'translateX(4px)';
                            }
                        }}
                        onMouseLeave={(e) => {
                            if (e.target.style.background === 'var(--color-bg-main)') {
                                e.target.style.background = 'transparent';
                                e.target.style.transform = 'translateX(0)';
                            }
                        }}
                    >
                        {item.icon}
                        {item.label}
                    </NavLink>
                ))}
            </nav>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: 'auto' }}>
                <button
                    className="btn glowing-btn"
                    style={{ width: '100%', justifyContent: 'center', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--color-danger)' }}
                    onClick={() => navigate('/emergency/generate')}
                >
                    <ShieldAlert size={18} /> Emergency QR
                </button>
                <button
                    className="btn text-muted"
                    style={{ width: '100%', justifyContent: 'flex-start', padding: '0.85rem 1.25rem', borderRadius: 'var(--radius-pill)' }}
                    onClick={handleLogout}
                    onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-danger)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-muted)' }}
                >
                    <LogOut size={18} /> Logout
                </button>
            </div>
        </div>
    );
};

export default Sidebar;
