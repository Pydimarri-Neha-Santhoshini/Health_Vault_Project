import React, { createContext, useState, useEffect, useContext } from 'react';
import { supabase } from '../lib/supabase';

const HealthContext = createContext();

export const useHealth = () => useContext(HealthContext);

export const HealthProvider = ({ children }) => {
    const [records, setRecords] = useState([]);
    const [recordsLoading, setRecordsLoading] = useState(true);

    const [insights, setInsights] = useState(null);
    const [insightsLoading, setInsightsLoading] = useState(true);

    const [contextUser, setContextUser] = useState(null);

    // Global Theme State
    const [theme, setTheme] = useState(() => {
        return localStorage.getItem('healthVaultTheme') || 'light';
    });

    // Sync theme to document and local storage
    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('healthVaultTheme', theme);
    }, [theme]);

    const toggleTheme = () => {
        setTheme(prev => prev === 'light' ? 'dark' : 'light');
    };

    // Track auth state to know when to fetch
    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setContextUser(session?.user || null);
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
            setContextUser(session?.user || null);
        });

        return () => subscription.unsubscribe();
    }, []);

    const fetchRecords = async (force = false) => {
        if (!contextUser) return;
        if (records.length > 0 && !force) {
            setRecordsLoading(false);
            return;
        }

        setRecordsLoading(true);
        try {
            const { data: sessionData } = await supabase.auth.getSession();
            const token = sessionData?.session?.access_token;
            if (!token) return;

            const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
            const res = await fetch(`${apiUrl}/records/`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const json = await res.json();
            if (json.data) {
                setRecords(json.data);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setRecordsLoading(false);
        }
    };

    const fetchInsights = async (force = false) => {
        if (!contextUser) return;
        if (insights && !force) {
            setInsightsLoading(false);
            return;
        }

        setInsightsLoading(true);
        try {
            const { data: sessionData } = await supabase.auth.getSession();
            const token = sessionData?.session?.access_token;
            if (!token) return;

            const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
            const res = await fetch(`${apiUrl}/insights/`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const json = await res.json();
            if (json.data) {
                setInsights(json.data);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setInsightsLoading(false);
        }
    };

    // Auto-fetch data when user logs in
    useEffect(() => {
        if (contextUser) {
            fetchRecords();
            fetchInsights();
        } else {
            // clear state on logout
            setRecords([]);
            setInsights(null);
            setRecordsLoading(true);
            setInsightsLoading(true);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [contextUser]);

    const refreshAll = () => {
        fetchRecords(true);
        fetchInsights(true);
    };

    const [isSummaryUpdating, setIsSummaryUpdating] = useState(false);

    const deleteRecord = async (recordId) => {
        try {
            console.log(`DEBUG: Attempting to delete record ${recordId}`);
            const { data: sessionData } = await supabase.auth.getSession();
            const token = sessionData?.session?.access_token;
            if (!token) return false;

            const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
            const res = await fetch(`${apiUrl}/records/${recordId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (res.ok) {
                console.log(`DEBUG: Record ${recordId} deleted successfully on backend.`);
                // Update local state immediately
                setRecords(prev => {
                    const next = prev.filter(r => r.id !== recordId);
                    console.log(`DEBUG: Local records count after deletion: ${next.length}`);
                    return next;
                });
                
                // Indicate summary is being regenerated
                setIsSummaryUpdating(true);
                
                // Refresh insights because recommendations and charts require update
                await fetchInsights(true);
                
                // Summary regeneration is backgrounded on server, so we might want to 
                // wait a bit and refresh again or just let the user refresh manually if they want 
                // the latest summary immediately.
                setTimeout(() => setIsSummaryUpdating(false), 5000); // UI hint for 5s
                
                return true;
            } else {
                const errorText = await res.text();
                console.error("Failed to delete record:", errorText);
                return false;
            }
        } catch (e) {
            console.error("Failed to delete record:", e);
            return false;
        }
    };

    return (
        <HealthContext.Provider value={{
            records,
            recordsLoading,
            insights,
            insightsLoading,
            fetchRecords,
            fetchInsights,
            refreshAll,
            deleteRecord,
            isSummaryUpdating,
            theme,
            toggleTheme
        }}>
            {children}
        </HealthContext.Provider>
    );
};
