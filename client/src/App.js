import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './lib/supabase';
import { HealthProvider } from './contexts/HealthContext';
import './styles/theme.css';

// Lazy load pages for performance
const Home = React.lazy(() => import('./pages/Home'));
const Auth = React.lazy(() => import('./pages/Auth'));
const Dashboard = React.lazy(() => import('./pages/Dashboard'));
const Timeline = React.lazy(() => import('./pages/Timeline'));
const Insights = React.lazy(() => import('./pages/Insights'));
const Profile = React.lazy(() => import('./pages/Profile'));
const EmergencyView = React.lazy(() => import('./pages/EmergencyView'));

// Protected Route Wrapper
const ProtectedRoute = ({ children, session }) => {
    // Check if the user is not just "logged in" but also "verified" via OTP
    // Note: Social logins (Google) bypass OTP verification as they already use 2FA
    const isVerified = localStorage.getItem('health_vault_otp_verified') === 'true' || 
                       session?.user?.app_metadata?.provider === 'google';

    if (!session) {
        return <Navigate to="/auth" replace />;
    }
    
    // Anti-Bypass Guard
    if (!isVerified) {
        return <Navigate to="/auth" replace />;
    }

    return children;
};

const App = () => {
    const [session, setSession] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            setLoading(false);
        });

        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((event, session) => {
            setSession(session);
            
            // Security: Clear OTP verification status on logout
            if (event === 'SIGNED_OUT') {
                localStorage.removeItem('health_vault_otp_verified');
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    if (loading) {
        return <div className="app-layout" style={{ justifyContent: 'center', alignItems: 'center' }}>Loading Health Vault...</div>;
    }

    const isVerified = localStorage.getItem('health_vault_otp_verified') === 'true' || 
                       session?.user?.app_metadata?.provider === 'google';

    return (
        <HealthProvider>
            <BrowserRouter>
                <React.Suspense fallback={<div className="app-layout" style={{ justifyContent: 'center', alignItems: 'center' }}>Loading View...</div>}>
                    <Routes>
                        {/* Public Routes */}
                        <Route path="/" element={<Home />} />
                        
                        {/* Auth Route: If logged in AND verified, go to dashboard. Otherwise, show Auth/OTP screen. */}
                        <Route 
                            path="/auth" 
                            element={(!session || !isVerified) ? <Auth /> : <Navigate to="/dashboard" />} 
                        />
                        
                        <Route path="/emergency/:token" element={<EmergencyView />} />

                        {/* Protected Routes gated by Anti-Bypass Guard */}
                        <Route
                            path="/dashboard"
                            element={<ProtectedRoute session={session}><Dashboard /></ProtectedRoute>}
                        />
                        <Route
                            path="/timeline"
                            element={<ProtectedRoute session={session}><Timeline /></ProtectedRoute>}
                        />
                        <Route
                            path="/insights"
                            element={<ProtectedRoute session={session}><Insights /></ProtectedRoute>}
                        />
                        <Route
                            path="/profile"
                            element={<ProtectedRoute session={session}><Profile /></ProtectedRoute>}
                        />

                        <Route path="*" element={<Navigate to="/" />} />
                    </Routes>
                </React.Suspense>
            </BrowserRouter>
        </HealthProvider>
    );
};

export default App;
