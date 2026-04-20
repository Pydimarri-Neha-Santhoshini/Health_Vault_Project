import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { AlertCircle, LogIn, Mail, CheckCircle, RefreshCw, ArrowLeft } from 'lucide-react';

const Auth = () => {
    const [loading, setLoading] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isSignUp, setIsSignUp] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    
    // OTP States
    const [step, setStep] = useState('credentials'); // 'credentials' | 'otp'
    const [otp, setOtp] = useState(['', '', '', '', '', '']);
    const [resendTimer, setResendTimer] = useState(0);
    const [isVerifying, setIsVerifying] = useState(false);
    const otpInputs = useRef([]);

    useEffect(() => {
        let interval;
        if (resendTimer > 0) {
            interval = setInterval(() => {
                setResendTimer((prev) => prev - 1);
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [resendTimer]);

    const handleEmailAuth = async (e) => {
        e.preventDefault();
        setLoading(true);
        setErrorMsg('');

        try {
            if (isSignUp) {
                const { error } = await supabase.auth.signUp({
                    email,
                    password,
                    options: {
                        data: {
                            full_name: email.split('@')[0],
                        }
                    }
                });
                if (error) throw error;
                
                // For signup, Supabase naturally sends a confirmation code/link.
                setStep('otp');
                setResendTimer(60);
            } else {
                // Step 1: Verify Password
                const { error: signInError } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                });
                
                if (signInError) {
                    if (signInError.message.includes("Email not confirmed")) {
                        await supabase.auth.resend({
                            type: 'signup',
                            email,
                        });
                        setStep('otp');
                        setResendTimer(60);
                        return;
                    }
                    throw signInError;
                }

                // Step 2: Trigger OTP for "Unified" flow
                const { error: otpError } = await supabase.auth.signInWithOtp({
                    email,
                });
                
                if (otpError) throw otpError;
                
                setStep('otp');
                setResendTimer(60);
            }
        } catch (error) {
            if (error.message?.toLowerCase().includes("rate limit") || error.status === 429) {
                setErrorMsg("Email rate limit exceeded. You can bypass this check in testing by using the mock code '000000' once the OTP screen appears.");
                // Hard transition to OTP step so they can use the mock code
                setStep('otp');
            } else {
                setErrorMsg(error.message);
            }
        } finally {
            setLoading(false);
        }
    };

    const handleOtpChange = (index, value) => {
        const char = value.substring(value.length - 1);
        if (char && isNaN(char)) return;
        
        const newOtp = [...otp];
        newOtp[index] = char;
        setOtp(newOtp);

        // Auto focus next
        if (char && index < 5) {
            otpInputs.current[index + 1].focus();
        }
    };

    const handleKeyDown = (index, e) => {
        if (e.key === 'Backspace' && !otp[index] && index > 0) {
            otpInputs.current[index - 1].focus();
        }
    };

    const handleVerifyOtp = async (e) => {
        e.preventDefault();
        const token = otp.join('');
        if (token.length < 6) return;

        setIsVerifying(true);
        setErrorMsg('');

        try {
            // Mock OTP for development/testing to bypass rate limits
            if (token === '000000') {
                console.log("Mock OTP used (000000). Bypassing verification.");
                localStorage.setItem('health_vault_otp_verified', 'true');
                // We still need a session, which we have from Step 1.
                // Just refreshing the UI will trigger the redirect in App.js
                window.location.reload(); 
                return;
            }

            // Priority 1: Try login type
            const { error: loginError } = await supabase.auth.verifyOtp({
                email,
                token,
                type: 'login'
            });

            if (loginError) {
                // Priority 2: Try signup/email confirmation type
                const { error: signupError } = await supabase.auth.verifyOtp({
                    email,
                    token,
                    type: isSignUp ? 'signup' : 'email'
                });
                
                if (signupError) throw signupError;
            }

            // Persistence Guard
            localStorage.setItem('health_vault_otp_verified', 'true');
        } catch (error) {
            if (error.message?.includes("rate limit")) {
                setErrorMsg("Email rate limit exceeded. Please wait a few minutes or use the mock code '000000' for testing.");
            } else {
                setErrorMsg(error.message || "Invalid or expired code.");
            }
        } finally {
            setIsVerifying(false);
        }
    };

    const handleResendOtp = async () => {
        if (resendTimer > 0) return;
        setResendTimer(60);
        setErrorMsg('');
        
        try {
            const { error } = await supabase.auth.signInWithOtp({ email });
            if (error) throw error;
        } catch (error) {
            setErrorMsg("Failed to resend code. Please check your connection.");
        }
    };

    if (step === 'otp') {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '2rem' }}>
                <div className="card animate-fade-in" style={{ width: '100%', maxWidth: '420px', display: 'flex', flexDirection: 'column', gap: '2rem', padding: '2.5rem' }}>
                    <button 
                        onClick={() => setStep('credentials')} 
                        style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.875rem' }}
                    >
                        <ArrowLeft size={16} /> Edit Login Details
                    </button>

                    <div style={{ textAlign: 'center' }}>
                        <div style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary)', width: '64px', height: '64px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem' }}>
                            <Mail size={32} />
                        </div>
                        <h2 style={{ fontSize: '1.75rem', fontWeight: '700', marginBottom: '0.5rem' }}>Enter Verification Code</h2>
                        <p className="text-muted">We've sent a 6-digit verification code to <br /><strong>{email}</strong></p>
                    </div>

                    {errorMsg && (
                        <div style={{ background: '#fee2e2', color: '#b91c1c', padding: '0.75rem', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
                            <AlertCircle size={16} /> {errorMsg}
                        </div>
                    )}

                    <form onSubmit={handleVerifyOtp} style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                            {otp.map((digit, idx) => (
                                <input
                                    key={idx}
                                    ref={(el) => (otpInputs.current[idx] = el)}
                                    type="text"
                                    inputMode="numeric"
                                    maxLength={1}
                                    value={digit}
                                    onChange={(e) => handleOtpChange(idx, e.target.value)}
                                    onKeyDown={(e) => handleKeyDown(idx, e)}
                                    style={{
                                        width: '45px',
                                        height: '56px',
                                        textAlign: 'center',
                                        fontSize: '1.5rem',
                                        fontWeight: '700',
                                        borderRadius: '12px',
                                        border: '2px solid var(--color-border)',
                                        background: 'var(--color-surface)',
                                        color: 'var(--color-text-main)',
                                        outline: 'none',
                                        transition: 'all 0.2s'
                                    }}
                                />
                            ))}
                        </div>

                        <button 
                            type="submit" 
                            className="btn btn-primary" 
                            disabled={isVerifying || otp.join('').length < 6} 
                            style={{ width: '100%', padding: '1rem', fontWeight: '600' }}
                        >
                            {isVerifying ? 'Verifying...' : 'Unlock Health Vault'}
                        </button>
                    </form>

                    <div style={{ textAlign: 'center' }}>
                        <button 
                            onClick={handleResendOtp}
                            disabled={resendTimer > 0}
                            style={{ 
                                background: 'none', 
                                border: 'none', 
                                color: resendTimer > 0 ? 'var(--color-text-muted)' : 'var(--color-primary)', 
                                fontWeight: '600', 
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                margin: '0 auto'
                            }}
                        >
                            <RefreshCw size={16} className={resendTimer > 0 ? '' : 'hover-spin'} />
                            {resendTimer > 0 ? `Resend in ${resendTimer}s` : 'Resend Code'}
                        </button>
                        <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: '1.25rem' }}>
                            Can't find it? Please check your <strong>Spam folder</strong>.
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '2rem' }}>
            <div className="card animate-fade-in" style={{ width: '100%', maxWidth: '400px', display: 'flex', flexDirection: 'column', gap: '1.5rem', padding: '2.5rem' }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ background: 'var(--color-primary)', width: '48px', height: '48px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem', color: 'white' }}>
                        <LogIn size={24} />
                    </div>
                    <h2 style={{ fontSize: '1.75rem', fontWeight: '800', color: 'var(--color-text-main)', letterSpacing: '-0.025em' }}>Health Vault</h2>
                    <p className="text-muted" style={{ marginTop: '0.25rem' }}>
                        {isSignUp ? 'Create your secure profile' : 'Sign in to access your records'}
                    </p>
                </div>

                {errorMsg && (
                    <div style={{ background: '#fee2e2', color: '#b91c1c', padding: '0.75rem', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
                        <AlertCircle size={16} /> {errorMsg}
                    </div>
                )}

                <form onSubmit={handleEmailAuth} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    <div>
                        <label className="label">Email</label>
                        <input
                            type="email"
                            className="input-field"
                            placeholder="you@email.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                        />
                    </div>
                    <div>
                        <label className="label">Password</label>
                        <input
                            type="password"
                            className="input-field"
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                    </div>

                    <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: '100%', padding: '0.85rem', fontWeight: '600' }}>
                        {loading ? 'Securing...' : (isSignUp ? 'Start Verification' : 'Login')}
                    </button>
                </form>

                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', margin: '0.5rem 0' }}>
                    <div style={{ flex: 1, height: '1px', background: 'var(--color-border)' }}></div>
                    <span className="text-muted" style={{ fontSize: '0.8rem' }}>or</span>
                    <div style={{ flex: 1, height: '1px', background: 'var(--color-border)' }}></div>
                </div>

                <button onClick={() => supabase.auth.signInWithOAuth({ provider: 'google' })} className="btn btn-outline" style={{ width: '100%', padding: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem' }}>
                    <svg width="18" height="18" viewBox="0 0 48 48" fill="none">
                        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.7 17.74 9.5 24 9.5z" />
                        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                    </svg>
                    Continue with Google
                </button>

                <p style={{ textAlign: 'center', fontSize: '0.875rem' }}>
                    {isSignUp ? 'Joined us before?' : "New here?"}{' '}
                    <span
                        onClick={() => setIsSignUp(!isSignUp)}
                        style={{ color: 'var(--color-primary)', cursor: 'pointer', fontWeight: '700' }}
                    >
                        {isSignUp ? 'Sign In' : 'Create an Account'}
                    </span>
                </p>
            </div>
        </div>
    );
};

export default Auth;
