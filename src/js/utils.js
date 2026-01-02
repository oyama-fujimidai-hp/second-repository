/**
 * 日付文字列を YYYY/MM/DD 形式に正規化する
 */
export const normalizeDate = (text, defaultYear = '2025') => {
    if (!text) return '';

    // YYYY-MM-DD, YYYY/MM/DD, YYYY年MM月DD日
    let match = text.match(/(\d{4})[-/_年]?(\d{1,2})[-/_月]?(\d{1,2})日?/);
    if (match) return `${match[1]}/${match[2].padStart(2, '0')}/${match[3].padStart(2, '0')}`;

    // MM月DD日 (年を補完)
    match = text.match(/(\d{1,2})月(\d{1,2})日/);
    if (match) return `${defaultYear}/${match[1].padStart(2, '0')}/${match[2].padStart(2, '0')}`;

    // MM-DD, MM/DD (年を補完)
    match = text.match(/^(\d{1,2})[-/](\d{1,2})$/);
    if (match) return `${defaultYear}/${match[1].padStart(2, '0')}/${match[2].padStart(2, '0')}`;

    return '';
};

/**
 * 結果リストから重複を除去する
 */
export const deduplicateResults = (items) => {
    const uniqueItems = [];
    const seenExcerpts = new Set();

    items.forEach(item => {
        const signature = (item.excerpt || '').replace(/\s/g, '').slice(0, 50);
        if (signature && !seenExcerpts.has(signature)) {
            seenExcerpts.add(signature);
            uniqueItems.push(item);
        }
    });

    return uniqueItems;
};

/**
 * クリップボードにTSV形式でコピーする
 */
export const copyToClipboardAsTsv = async (results) => {
    if (!results || results.length === 0) return false;

    const headers = ["日付", "受付番号", "種別", "実際の会話（抜粋）", "内容の要約"];
    const tsvContent = [
        headers.join("\t"),
        ...results.map(row => [
            `"${(row.date || '').replace(/"/g, '""')}"`,
            `"${(row.receptionNumber || '').toString().replace(/"/g, '""')}"`,
            `"${(row.type || '').replace(/"/g, '""')}"`,
            `"${(row.excerpt || '').replace(/"/g, '""')}"`,
            `"${(row.summary || '').replace(/"/g, '""')}"`
        ].join("\t"))
    ].join("\n");

    try {
        await navigator.clipboard.writeText(tsvContent);
        return true;
    } catch (err) {
        console.error('Clipboard copy failed:', err);
        return false;
    }
};
