import React, { useState, useRef, useEffect } from 'react';
import { Upload, X, FileText, CheckCircle, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';

const UploadModal = ({ isOpen, onClose, onSuccess }) => {
    const [file, setFile] = useState(null);
    const [formData, setFormData] = useState({
        title: '',
        date: new Date().toISOString().split('T')[0],
        type: 'Lab',
        description: '',
    });
    const [status, setStatus] = useState('idle'); // idle, uploading, success, error
    const [errorMsg, setErrorMsg] = useState('');
    const [validationScore, setValidationScore] = useState(null);
    const [progressMsg, setProgressMsg] = useState('Uploading...');
    const fileInputRef = useRef(null);

    const progressSteps = [
        "Uploading file...",
        "AI is reading report...",
        "Validating medical document...",
        "Extracting health metrics...",
        "Saving to Vault..."
    ];

    useEffect(() => {
        let interval;
        if (status === 'uploading') {
            let step = 0;
            interval = setInterval(() => {
                step = (step + 1) % progressSteps.length;
                setProgressMsg(progressSteps[step]);
            }, 3000);
        } else {
            setProgressMsg('Uploading...');
        }
        return () => clearInterval(interval);
    }, [status, progressSteps]);

    if (!isOpen) return null;

    const handleFileChange = (e) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
        }
    };

    const handleDragOver = (e) => {
        e.preventDefault();
    };

    const handleDrop = (e) => {
        e.preventDefault();
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            setFile(e.dataTransfer.files[0]);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!file) {
            setErrorMsg('Please select a file to upload.');
            return;
        }

        setStatus('uploading');
        setErrorMsg('');
        setValidationScore(null);

        const data = new FormData();
        data.append('file', file);
        data.append('title', formData.title || file.name);
        data.append('date', formData.date);
        data.append('type', formData.type);
        data.append('description', formData.description);

        try {
            const { data: sessionData } = await supabase.auth.getSession();
            const token = sessionData?.session?.access_token;

            if (!token) throw new Error("Authentication required");

            const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

            const response = await fetch(`${apiUrl}/records/upload`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: data,
            });

            const result = await response.json();

            if (!response.ok) {
                if (result.validation_score !== undefined) {
                    setValidationScore(result.validation_score);
                }
                throw new Error(result.error || 'Failed to upload report');
            }

            setStatus('success');
            setValidationScore(result.validation_score);

            // Auto close after 2 seconds on success
            setTimeout(() => {
                if (onSuccess) {
                    onSuccess();
                } else {
                    onClose();
                }
                setStatus('idle');
                setFile(null);
            }, 2000);

        } catch (err) {
            setStatus('error');
            setErrorMsg(err.message);
        }
    };

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)',
            zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '1rem'
        }}>
            <div className="card animate-fade-in" style={{ width: '100%', maxWidth: '550px', maxHeight: '90vh', overflowY: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <h2 style={{ fontSize: '1.25rem' }}>Upload AI-Processed Record</h2>
                    <button onClick={onClose} style={{ color: 'var(--color-text-muted)', background: 'transparent', padding: '0.25rem' }}>
                        <X size={20} />
                    </button>
                </div>

                {status === 'success' ? (
                    <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
                        <CheckCircle size={64} color="var(--color-success)" style={{ margin: '0 auto 1rem' }} />
                        <h3 style={{ color: 'var(--color-success)', marginBottom: '0.5rem' }}>Upload Successful!</h3>
                        <p className="text-muted">AI Validation Score: {((validationScore || 1) * 100).toFixed(0)}%</p>
                        <p className="text-muted" style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>Structured insights have been extracted.</p>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

                        {/* Drag & Drop Zone */}
                        <div
                            onDragOver={handleDragOver}
                            onDrop={handleDrop}
                            onClick={() => fileInputRef.current?.click()}
                            style={{
                                border: `2px dashed ${file ? 'var(--color-primary)' : 'var(--color-border)'}`,
                                background: file ? 'var(--color-bg-light)' : 'transparent',
                                borderRadius: 'var(--radius-md)',
                                padding: '2.5rem 1.5rem',
                                textAlign: 'center',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                gap: '0.75rem'
                            }}
                        >
                            <input
                                type="file"
                                ref={fileInputRef}
                                onChange={handleFileChange}
                                style={{ display: 'none' }}
                                accept=".pdf,image/png,image/jpeg"
                            />
                            {file ? (
                                <>
                                    <FileText size={32} color="var(--color-primary)" />
                                    <p style={{ fontWeight: '500', color: 'var(--color-primary)' }}>{file.name}</p>
                                    <p className="text-muted" style={{ fontSize: '0.875rem' }}>Click or drag to replace</p>
                                </>
                            ) : (
                                <>
                                    <Upload size={32} color="var(--color-text-muted)" />
                                    <p style={{ fontWeight: '500' }}>Click to upload or drag and drop</p>
                                    <p className="text-muted" style={{ fontSize: '0.875rem' }}>PDF, PNG, JPG (max 10MB)</p>
                                </>
                            )}
                        </div>

                        {errorMsg && (
                            <div style={{ background: '#fee2e2', color: '#b91c1c', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'flex-start', gap: '0.5rem', fontSize: '0.875rem', lineHeight: '1.5' }}>
                                <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                                <span>{errorMsg}</span>
                            </div>
                        )}

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <div>
                                <label className="label">Report Title</label>
                                <input
                                    type="text"
                                    className="input-field"
                                    placeholder="e.g. Annual Blood Test"
                                    value={formData.title}
                                    onChange={e => setFormData({ ...formData, title: e.target.value })}
                                    required
                                />
                            </div>
                            <div>
                                <label className="label">Date on Report</label>
                                <input
                                    type="date"
                                    className="input-field"
                                    value={formData.date}
                                    onChange={e => setFormData({ ...formData, date: e.target.value })}
                                    required
                                />
                            </div>
                        </div>

                        <div>
                            <label className="label">Report Type</label>
                            <select
                                className="input-field"
                                value={formData.type}
                                onChange={e => setFormData({ ...formData, type: e.target.value })}
                            >
                                <option value="Lab">Lab Result</option>
                                <option value="Visit">Clinical Visit</option>
                                <option value="Surgery">Surgery / Procedure</option>
                                <option value="Prescription">Prescription</option>
                                <option value="Allergy">Allergy Documentation</option>
                            </select>
                        </div>

                        <div>
                            <label className="label">Notes / Description (Optional)</label>
                            <textarea
                                className="input-field"
                                rows="2"
                                placeholder="Any doctor notes or context..."
                                value={formData.description}
                                onChange={e => setFormData({ ...formData, description: e.target.value })}
                            ></textarea>
                        </div>

                        <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                            <button
                                type="button"
                                className="btn btn-outline"
                                style={{ flex: 1 }}
                                onClick={onClose}
                                disabled={status === 'uploading'}
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className="btn btn-primary"
                                style={{ flex: 2 }}
                                disabled={status === 'uploading' || !file}
                            >
                                {status === 'uploading' ? progressMsg : 'Upload & Process'}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
};

export default UploadModal;
