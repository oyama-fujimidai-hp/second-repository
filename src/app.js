import React, { useState, useEffect } from 'https://esm.sh/react@18?dev';
import { createRoot } from 'https://esm.sh/react-dom@18/client?dev';
import { FileText, Activity, Download, Play, Settings, AlertCircle, Loader2, Copy, ExternalLink, Sheet, Upload } from 'https://esm.sh/lucide-react@0.294.0?dev';

// ユーザーが提供したシステムプロンプトの定義
const ANALYSIS_SYSTEM_PROMPT = `
# 役割
あなたは、臨床面談やカウンセリングの文字起こし（書き起こし）を分析する専門的なアシスタントです。

# 目的
入力された精神科外来の診察記録（文字起こし）を分析し、以下の定義に基づく「注目すべき会話パターン」を特定してください。
特定した結果は、指定されたJSON形式で報告してください。

# 分析の定義
以下の2つのパターンに該当する箇所を特定してください。

1. **会話ラリー（議論・やり取り）**
   - **定義**: 医師と患者が、比較的短い発言（例：1〜3文程度）を**連続して5往復以上（合計10ターン以上）**活発に交換している箇所。
   - **除外**: 単純な相槌（「はい」「ええ」「うーん」）のみのやり取りはカウントしません。

2. **患者の長い発話（モノローグ）**
   - **定義**: 医師からの短い相槌や最小限の質問（例：「それで？」「他には？」）を挟むだけで、患者が実質的に連続して5文以上（または目安として150文字以上）一人で話し続けている箇所。

# 制約事項
- 文字起こしのテキストのみに基づいて、上記の定義に合致する箇所を客観的に分析してください。
- 医学的な解釈、診断、評価は一切行わないでください。
- 「実際の会話（抜粋）」は、分析の根拠となる具体的なテキストをそのまま引用してください。

# 出力形式 (JSON)
結果は必ず以下のJSONスキーマに従った配列で出力してください。Markdownの表ではありません。

[
  {
    "date": "文字列（ファイル名やデータに含まれる日付、不明なら空文字）",
    "receptionNumber": "数値または文字列（患者の識別番号。半角数字のみ。不明なら空文字）",
    "type": "文字列（'ラリー' または 'モノローグ'）",
    "excerpt": "文字列（該当箇所の会話の冒頭部分や象徴的なやり取り。'患者: xxx' '医師: xxx' の形式）",
    "summary": "文字列（【要約タイトル】詳細な説明 の形式）"
  }
]

該当箇所がない場合は空の配列 [] を返してください。
`;

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
        if (storedKey) {
            setApiKey(storedKey);
        }
    }, []);

    const saveApiKey = (key) => {
        setApiKey(key);
        localStorage.setItem('gemini_api_key', key);
        setShowSettings(false);
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
            // APIリクエストを行う関数（単発）
            const fetchAnalysis = async () => {
                const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{
                            parts: [{ text: `ファイル名: ${fileName}\n\n内容:\n${inputText}` }]
                        }],
                        systemInstruction: {
                            parts: [{ text: ANALYSIS_SYSTEM_PROMPT }]
                        },
                        generationConfig: {
                            responseMimeType: "application/json",
                            temperature: 0.2
                        }
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

            // 2回並列実行して結果を統合する
            const rawResultsArray = await Promise.all([
                fetchAnalysis(),
                fetchAnalysis()
            ]);

            // 全結果を1つの配列にフラット化
            const allItems = rawResultsArray.flat();

            // 重複除去
            const uniqueItems = [];
            const seenExcerpts = new Set();

            allItems.forEach(item => {
                const signature = (item.excerpt || '').replace(/\s/g, '').slice(0, 50);
                if (signature && !seenExcerpts.has(signature)) {
                    seenExcerpts.add(signature);
                    uniqueItems.push(item);
                }
            });

            // 日付処理
            const normalizeDate = (text) => {
                if (!text) return '';
                const m1 = text.match(/(\d{4})[-/_年]?(\d{1,2})[-/_月]?(\d{1,2})日?/);
                if (m1) return `${m1[1]}/${m1[2].padStart(2, '0')}/${m1[3].padStart(2, '0')}`;
                const m2 = text.match(/(\d{1,2})月(\d{1,2})日/);
                if (m2) return `2025/${m2[1].padStart(2, '0')}/${m2[2].padStart(2, '0')}`;
                const m3 = text.match(/^(\d{1,2})[-/](\d{1,2})$/);
                if (m3) return `2025/${m3[1].padStart(2, '0')}/${m3[2].padStart(2, '0')}`;
                return '';
            };

            const fileDate = normalizeDate(fileName);

            const processedResults = uniqueItems.map(item => ({
                ...item,
                date: normalizeDate(item.date) || fileDate || ''
            }));

            setResults(processedResults);

        } catch (err) {
            console.error(err);
            setError(`エラーが発生しました: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    const handleOpenSpreadsheet = () => {
        if (!results || results.length === 0) return;
        const headers = ["日付", "受付番号", "種別", "実際の会話（抜粋）", "内容の要約"];
        const tsvContent = [
            headers.join("\t"),
            ...results.map(row => {
                return [
                    `"${(row.date || '').replace(/"/g, '""')}"`,
                    `"${(row.receptionNumber || '').toString().replace(/"/g, '""')}"`,
                    `"${(row.type || '').replace(/"/g, '""')}"`,
                    `"${(row.excerpt || '').replace(/"/g, '""')}"`,
                    `"${(row.summary || '').replace(/"/g, '""')}"`
                ].join("\t");
            })
        ].join("\n");

        const textArea = document.createElement("textarea");
        textArea.value = tsvContent;
        document.body.appendChild(textArea);
        textArea.select();
        try {
            document.execCommand('copy');
            setCopyStatus('copied');
            window.open('https://sheets.new', '_blank');
            setTimeout(() => setCopyStatus(''), 8000);
        } catch (err) {
            console.error('Copy failed', err);
            setCopyStatus('error');
        }
        document.body.removeChild(textArea);
    };

    const handleFileUpload = (event) => {
        const file = event.target.files[0];
        if (!file) return;

        setFileName(file.name);
        setError('');

        if (file.name.toLowerCase().endsWith('.gdoc')) {
            setError('Googleドキュメント(.gdoc)は直接読み込めません。Microsoft Word (.docx)として保存したファイルをアップロードしてください。');
            return;
        }

        if (file.name.toLowerCase().endsWith('.docx')) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const arrayBuffer = e.target.result;
                mammoth.extractRawText({ arrayBuffer: arrayBuffer })
                    .then(result => {
                        setInputText(result.value);
                    })
                    .catch(err => {
                        console.error(err);
                        setError('Wordファイルの読み込みに失敗しました。');
                    });
            };
            reader.readAsArrayBuffer(file);
        } else {
            const reader = new FileReader();
            reader.onload = (e) => {
                setInputText(e.target.result);
            };
            reader.readAsText(file);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 text-slate-800 font-sans flex flex-col items-center py-10 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
            {/* Header */}
            <div className="w-full flex justify-between items-center mb-8 border-b border-slate-200 pb-4">
                <div className="flex items-center gap-3">
                    <div className="bg-blue-600 p-2 rounded-lg text-white">
                        <Activity className="w-5 h-5" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">文字起こし分析アシスタント</h1>
                        <p className="text-sm text-slate-500">会話ラリーとモノローグを自動抽出・分析 (Powered by Gemini 3.0 Flash Preview)</p>
                    </div>
                </div>
                <button
                    onClick={() => setShowSettings(!showSettings)}
                    className="text-slate-500 hover:text-blue-600 transition-colors p-2 rounded-full hover:bg-slate-100"
                    title="API設定"
                >
                    <Settings className="w-5 h-5" />
                </button>
            </div>

            {/* API Key Modal */}
            {showSettings && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
                        <h3 className="text-lg font-bold mb-4">設定</h3>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                            Google Gemini API Key
                        </label>
                        <input
                            type="password"
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            placeholder="AIzaSy..."
                            className="w-full border border-slate-300 rounded-md p-2 mb-4 focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                        <div className="flex justify-end gap-2">
                            <button onClick={() => setShowSettings(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-md">
                                キャンセル
                            </button>
                            <button onClick={() => saveApiKey(apiKey)} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">
                                保存
                            </button>
                        </div>
                        <p className="text-xs text-slate-400 mt-4">
                            ※APIキーはブラウザのローカルストレージに保存され、外部サーバーには送信されません。
                        </p>
                    </div>
                </div>
            )}

            {/* Main Content Grid */}
            <div className="w-full grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Left: Input Area */}
                <div className="flex flex-col gap-4">
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex-grow flex flex-col h-[600px]">
                        <div className="flex justify-between items-center mb-2">
                            <label className="block text-sm font-semibold text-slate-700 flex items-center gap-2">
                                <FileText className="w-5 h-5" />
                                文字起こしテキスト
                            </label>
                            <div>
                                <input type="file" id="file-upload" accept=".txt,.md,.csv,.docx" className="hidden" onChange={handleFileUpload} />
                                <label htmlFor="file-upload" className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 cursor-pointer bg-blue-50 px-2 py-1 rounded hover:bg-blue-100 transition-colors">
                                    <Upload className="w-3 h-3" />
                                    ファイルを開く
                                </label>
                                {fileName && <div className="mt-1 text-[10px] text-slate-400 truncate max-w-[120px]" title={fileName}>{fileName}</div>}
                            </div>
                        </div>
                        <textarea
                            className="flex-grow w-full p-4 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none font-mono text-sm leading-relaxed"
                            placeholder="ここに診察の文字起こしを貼り付けてください..."
                            value={inputText}
                            onChange={(e) => setInputText(e.target.value)}
                        ></textarea>
                        <div className="mt-4 flex justify-between items-center">
                            <span className="text-xs text-slate-400">文字数: {inputText.length}</span>
                            <button
                                onClick={handleAnalyze}
                                disabled={loading}
                                className={`flex items-center gap-2 px-6 py-2 rounded-lg font-medium text-white transition-all ${loading ? 'bg-slate-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 shadow-md hover:shadow-lg'}`}
                            >
                                {loading ? <><Loader2 className="w-5 h-5 animate-spin" />分析中...</> : <><Play className="w-5 h-5" />分析開始</>}
                            </button>
                        </div>
                    </div>
                    {error && (
                        <div className="bg-red-50 text-red-600 p-4 rounded-lg border border-red-200 flex items-start gap-2">
                            <AlertCircle className="w-5 h-5" />
                            <span>{error}</span>
                        </div>
                    )}
                </div>

                {/* Right: Output Area */}
                <div className="flex flex-col gap-4 h-[600px]">
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex-grow flex flex-col overflow-hidden">
                        <div className="flex justify-between items-center mb-4">
                            <div className="flex items-center gap-3">
                                <h2 className="text-lg font-bold text-slate-800">分析結果</h2>
                                {results && <span className="bg-slate-100 text-slate-600 text-xs font-medium px-2 py-0.5 rounded-full">全 {results.length} 件</span>}
                            </div>
                            {results && results.length > 0 && (
                                <button onClick={handleOpenSpreadsheet} className={`flex items-center gap-2 text-sm px-3 py-1.5 rounded-md transition-all ${copyStatus === 'copied' ? 'bg-green-100 text-green-800 font-bold ring-2 ring-green-500 ring-offset-1' : 'text-green-700 hover:text-green-900 hover:bg-green-50'}`}>
                                    {copyStatus === 'copied' ? <><ExternalLink className="w-4 h-4" />シートを開きました（Ctrl+Vで貼付）</> : <><Copy className="w-4 h-4" />スプレッドシートで開く</>}
                                </button>
                            )}
                        </div>
                        <div className="flex-grow overflow-auto border border-slate-100 rounded-lg custom-scrollbar">
                            {!results && !loading && (
                                <div className="h-full flex flex-col items-center justify-center text-slate-400">
                                    <Activity className="w-12 h-12 mb-2 opacity-50" />
                                    <p className="mt-2 text-sm">左側のフォームに入力して分析を開始してください</p>
                                </div>
                            )}
                            {loading && (
                                <div className="h-full flex flex-col items-center justify-center text-slate-400 animate-pulse">
                                    <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-4"></div>
                                    <p>AIが会話パターンを解析しています...</p>
                                </div>
                            )}
                            {results && results.length === 0 && (
                                <div className="h-full flex flex-col items-center justify-center text-slate-500">
                                    <p>定義に該当する箇所は見つかりませんでした。</p>
                                </div>
                            )}
                            {results && results.length > 0 && (
                                <table className="min-w-full text-left text-sm whitespace-nowrap">
                                    <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 sticky top-0 z-10 shadow-sm">
                                        <tr>
                                            <th className="px-3 py-2 font-semibold w-24">日付</th>
                                            <th className="px-3 py-2 font-semibold w-16 text-center">No.</th>
                                            <th className="px-3 py-2 font-semibold w-20">種別</th>
                                            <th className="px-3 py-2 font-semibold w-1/3">実際の会話（抜粋）</th>
                                            <th className="px-3 py-2 font-semibold">内容の要約</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {results.map((row, index) => (
                                            <tr key={index} className="hover:bg-slate-50 transition-colors border-b border-slate-50">
                                                <td className="px-2 py-0.5 text-slate-600 align-top text-[10px]">{row.date || '-'}</td>
                                                <td className="px-2 py-0.5 text-slate-600 font-mono text-center align-top text-[10px]">{row.receptionNumber || '-'}</td>
                                                <td className="px-2 py-0.5 align-top">
                                                    <span className={`inline-flex items-center px-1.5 py-0 rounded text-[9px] font-medium ${row.type === 'ラリー' ? 'bg-indigo-50 text-indigo-700 border border-indigo-100' : 'bg-orange-50 text-orange-700 border border-orange-100'}`}>
                                                        {row.type}
                                                    </span>
                                                </td>
                                                <td className="px-2 py-0.5 text-slate-700 whitespace-normal min-w-[300px] align-top">
                                                    <div className="bg-slate-50/50 p-1 rounded border border-slate-100 text-[9px] font-mono leading-tight text-slate-500 max-h-12 overflow-y-auto custom-scrollbar">
                                                        {row.excerpt}
                                                    </div>
                                                </td>
                                                <td className="px-2 py-0.5 text-slate-700 whitespace-normal min-w-[200px] align-top text-[10px] leading-tight">
                                                    {row.summary}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

const root = createRoot(document.getElementById('root'));
root.render(<App />);
