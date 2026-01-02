import React, { useState, useEffect } from 'https://esm.sh/react@18';
import { createRoot } from 'https://esm.sh/react-dom@18/client';
import {
    FileText, Activity, Download, Play, Settings,
    AlertCircle, Loader2, Copy, ExternalLink,
    Upload, X, CheckCircle2, ChevronRight
} from 'https://esm.sh/lucide-react@0.294.0';

import { ANALYSIS_SYSTEM_PROMPT } from '/js/constants.js';
import { normalizeDate, deduplicateResults, copyToClipboardAsTsv } from '/js/utils.js';

function App() {
    const [inputText, setInputText] = useState('');
    const [results, setResults] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [apiKey, setApiKey] = useState('');
    const [showSettings, setShowSettings] = useState(false);
    const [copyStatus, setCopyStatus] = useState(''); // '' | 'copied' | 'error'
    const [fileName, setFileName] = useState('');

    useEffect(() => {
        const storedKey = localStorage.getItem('gemini_api_key');
        if (storedKey) setApiKey(storedKey);
    }, []);

    const saveApiKey = () => {
        localStorage.setItem('gemini_api_key', apiKey);
        setShowSettings(false);
    };

    const handleFileUpload = async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        setFileName(file.name);
        setError('');

        if (file.name.toLowerCase().endsWith('.gdoc')) {
            setError('Googleドキュメント(.gdoc)は直接読み込めません。Word形式でダウンロードしてからアップロードしてください。');
            return;
        }

        try {
            if (file.name.toLowerCase().endsWith('.docx')) {
                const arrayBuffer = await file.arrayBuffer();
                // @ts-ignore
                const result = await mammoth.extractRawText({ arrayBuffer });
                setInputText(result.value);
            } else {
                const text = await file.text();
                setInputText(text);
            }
        } catch (err) {
            setError('ファイルの読み込みに失敗しました。');
        }
    };

    const handleAnalyze = async () => {
        if (!inputText.trim()) {
            setError('文字起こしテキストを入力してください。');
            return;
        }
        if (!apiKey) {
            setError('APIキーが設定されていません。');
            setShowSettings(true);
            return;
        }

        setLoading(true);
        setError('');
        setResults(null);
        setCopyStatus('');

        try {
            const fetchAnalysis = async () => {
                const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: `ファイル名: ${fileName}\n\n内容:\n${inputText}` }] }],
                        systemInstruction: { parts: [{ text: ANALYSIS_SYSTEM_PROMPT }] },
                        generationConfig: { responseMimeType: "application/json", temperature: 0.2 }
                    })
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error?.message || 'API Error');
                }

                const data = await response.json();
                const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
                return textResponse ? JSON.parse(textResponse) : [];
            };

            const rawResultsArray = await Promise.all([fetchAnalysis(), fetchAnalysis()]);
            const uniqueItems = deduplicateResults(rawResultsArray.flat());

            const fileDate = normalizeDate(fileName);
            const processedResults = uniqueItems.map(item => ({
                ...item,
                date: normalizeDate(item.date) || fileDate || '-'
            }));

            setResults(processedResults);
        } catch (err) {
            setError(`エラーが発生しました: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    const handleCopyAndExport = async () => {
        const success = await copyToClipboardAsTsv(results);
        if (success) {
            setCopyStatus('copied');
            window.open('https://sheets.new', '_blank');
            setTimeout(() => setCopyStatus(''), 5000);
        } else {
            setCopyStatus('error');
        }
    };

    return (
        <div className="container animate-fade-in">
            <header>
                <div className="logo-section">
                    <div className="logo-icon">
                        <Activity size={24} />
                    </div>
                    <div>
                        <h1>Clinical Transcript Analyzer</h1>
                        <p className="subtitle">AIによる臨床会話パターンの自動解析</p>
                    </div>
                </div>
                <button className="btn btn-ghost" onClick={() => setShowSettings(true)}>
                    <Settings size={20} />
                </button>
            </header>

            <div className="app-grid">
                {/* Input Section */}
                <div className="card">
                    <div className="card-title">
                        <div className="flex items-center gap-2">
                            <FileText size={18} className="text-primary" />
                            <span>入力データ</span>
                        </div>
                        <label className="upload-label">
                            <Upload size={14} />
                            <span>ファイルを選択</span>
                            <input type="file" hidden accept=".txt,.md,.docx" onChange={handleFileUpload} />
                        </label>
                    </div>

                    {fileName && (
                        <div className="flex items-center gap-2 mb-3 bg-primary-light text-primary text-xs px-3 py-1.5 rounded-md border border-blue-100">
                            <CheckCircle2 size={12} />
                            <span className="font-medium truncate flex-grow">{fileName}</span>
                            <button onClick={() => { setFileName(''); setInputText(''); }} className="hover:text-primary-hover">
                                <X size={12} />
                            </button>
                        </div>
                    )}

                    <div className="textarea-container">
                        <textarea
                            placeholder="ここに診察の文字起こしを貼り付けてください..."
                            value={inputText}
                            onChange={(e) => setInputText(e.target.value)}
                        />
                    </div>

                    <div className="controls">
                        <span className="text-xs text-muted">
                            文字数: {inputText.length.toLocaleString()} 字
                        </span>
                        <button
                            className="btn btn-primary"
                            onClick={handleAnalyze}
                            disabled={loading || !inputText}
                        >
                            {loading ? <Loader2 className="animate-spin" size={18} /> : <Play size={18} />}
                            {loading ? '分析中...' : '分析を開始'}
                        </button>
                    </div>

                    {error && (
                        <div className="mt-4 p-3 bg-red-50 border border-red-100 rounded-lg flex items-start gap-2 text-red-600 text-sm">
                            <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}
                </div>

                {/* Results Section */}
                <div className="card results-area">
                    <div className="card-title">
                        <div className="flex items-center gap-2">
                            <Activity size={18} className="text-primary" />
                            <span>分析結果</span>
                            {results && (
                                <span className="bg-slate-100 text-slate-500 text-[10px] px-2 py-0.5 rounded-full">
                                    {results.length} 件
                                </span>
                            )}
                        </div>
                        {results && results.length > 0 && (
                            <button
                                className={`btn btn-secondary ${copyStatus === 'copied' ? 'border-green-500 text-green-600' : ''}`}
                                onClick={handleCopyAndExport}
                            >
                                {copyStatus === 'copied' ? <CheckCircle2 size={16} /> : <Copy size={16} />}
                                {copyStatus === 'copied' ? 'コピー完了' : 'シートで開く'}
                            </button>
                        )}
                    </div>

                    <div className="table-container custom-scrollbar">
                        {!results && !loading && (
                            <div className="empty-state">
                                <Activity />
                                <p>テキストを入力して分析を開始すると<br />ここに結果が表示されます</p>
                            </div>
                        )}

                        {loading && (
                            <div className="empty-state">
                                <div className="loading-spinner"></div>
                                <p>AIが会話を解析中です...<br />しばらくお待ちください</p>
                            </div>
                        )}

                        {results && results.length === 0 && (
                            <div className="empty-state">
                                <AlertCircle />
                                <p>該当する会話パターンが<br />見つかりませんでした</p>
                            </div>
                        )}

                        {results && results.length > 0 && (
                            <table>
                                <thead>
                                    <tr>
                                        <th style={{ width: '90px' }}>日付</th>
                                        <th style={{ width: '100px' }}>種別</th>
                                        <th>内容と抜粋</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {results.map((row, i) => (
                                        <tr key={i} className="animate-fade-in" style={{ animationDelay: `${i * 0.05}s` }}>
                                            <td><div className="text-muted">{row.date}</div></td>
                                            <td>
                                                <span className={`badge ${row.type === 'ラリー' ? 'badge-rally' : 'badge-monologue'}`}>
                                                    {row.type}
                                                </span>
                                            </td>
                                            <td>
                                                <div className="font-semibold text-slate-800 mb-1">{row.summary}</div>
                                                <div className="excerpt-box">{row.excerpt}</div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            </div>

            {/* Settings Modal */}
            {showSettings && (
                <div className="modal-overlay" onClick={() => setShowSettings(false)}>
                    <div className="modal animate-fade-in" onClick={e => e.stopPropagation()}>
                        <div className="modal-title">API設定</div>
                        <div className="modal-body">
                            <div className="input-group">
                                <label>Google Gemini API Key</label>
                                <input
                                    type="password"
                                    placeholder="AIzaSy..."
                                    value={apiKey}
                                    onChange={e => setApiKey(e.target.value)}
                                />
                                <p className="text-[10px] text-muted mt-2">
                                    ※APIキーはブラウザに安全に保存されます。
                                </p>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setShowSettings(false)}>キャンセル</button>
                            <button className="btn btn-primary" onClick={saveApiKey}>保存して閉じる</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

const root = createRoot(document.getElementById('root'));
root.render(<App />);
