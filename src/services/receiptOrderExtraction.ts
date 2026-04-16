import { GoogleGenAI, Type } from '@google/genai';

/** Google deprecates older Flash IDs for new keys; use current GA model (see ai.google.dev/gemini-api/docs/models). */
const RECEIPT_EXTRACTION_MODEL = 'gemini-2.5-flash';

export type ReceiptOrderItemNormalized = {
    item_name: string;
    quantity: number;
    menu_selection: string;
    line_price: number;
    order_id: number;
};

export type ReceiptOrderGroup = {
    order_id: number;
    order_total_amount: number;
    items: {
        item_name: string;
        quantity: number;
        menu_selection: string;
        line_price: number;
    }[];
};

export type ReceiptOrderExtractionResult = {
    orders: ReceiptOrderGroup[];
    items: ReceiptOrderItemNormalized[];
    receipt_grand_total: number;
    extracted_items_sum: number;
    math_match: boolean;
};

function cleanExtractedOrderName(input: string): string {
    const raw = String(input ?? '')
        .replace(/^[\s\-–—*#\[\](){}|]+/, '')
        .replace(/^\d+\s+/, '')
        .replace(/\s+/g, ' ')
        .trim();
    if (!raw) return '';
    return raw.replace(/[^\p{L}\p{N}\s/&.+-]/gu, '').replace(/\s+/g, ' ').trim();
}

function cleanMenuSelection(input: string): string {
    const t = String(input ?? '').trim();
    if (!t) return '';
    return t.replace(/\s+/g, ' ').trim();
}

function isJunkLineName(n: string): boolean {
    const lower = n.toLowerCase();
    if (!lower) return true;
    if (
        lower.includes('total amount') ||
        lower.includes('vatable') ||
        lower.includes('vat amount') ||
        lower.includes('vat exempt') ||
        lower.includes('zero-rated') ||
        lower.includes('balance due') ||
        lower.includes('cashier') ||
        lower.includes('transaction') ||
        lower.includes('sold to') ||
        lower === 'cash' ||
        lower === 'change'
    ) {
        return true;
    }
    return false;
}

/**
 * Extract sold line items from a customer / POS receipt image (orders flow).
 * Returns grouped `orders` plus flattened `items` for mapping UI.
 */
export async function extractOrderLinesFromReceiptImage(
    imageDataUrl: string,
    apiKey: string
): Promise<ReceiptOrderExtractionResult> {
    const ai = new GoogleGenAI({ apiKey });
    const base64Data = imageDataUrl.split(',')[1];
    if (!base64Data) throw new Error('Invalid image data');

    const prompt = `You extract restaurant or retail POS receipts into JSON for order entry.

The image may be one long stitched receipt (multiple photos). Read top to bottom completely.

GROUPED ORDERS (critical):
- Identify distinct order sessions or logical groups: repeated headers, dashed dividers, separate "Total Amount" / transaction blocks, timestamps, table or ticket changes, or natural blank gaps.
- Output an array called "orders". Each element is ONE order block in reading order.
- order_id must be 1, 2, 3, ... in the order they appear on the receipt.
- Do not merge lines from different order blocks.

Each order object must have:
- order_id (integer, 1-based, in appearance order)
- items: array of line items belonging only to that order
- order_total_amount: sum of that block's line_price values (decimals only). Compute this yourself.

Each line item must have:
- item_name: text AS PRINTED in the item column (do not translate or rename)
- quantity: number (if not shown, use 1)
- menu_selection: modifiers printed on the receipt for that line — size, set meal choice, add-ons, variant, or empty string "" if none
- line_price: final extended price for that line only (number, no currency symbols)

Global rules:
- Include food, drinks, and packaged goods sold. Exclude store boilerplate, TIN, cashier-only lines, payment/change lines, and standalone tax-only lines unless they are a real product line.
- Numbers: decimals only; no "P", "Php", "₱", or letters in numeric fields.
- receipt_grand_total: if the receipt shows one overall total, use it; if multiple separate transactions with separate totals, use the sum of those transaction totals (or sum of order_total_amount if that matches the print).
- extracted_items_sum: sum of every line_price across all orders.
- math_match: true if extracted_items_sum equals receipt_grand_total within 2 (rounding).

Extract only from merchandise line rows (typically between ITEM/QTY/PRICE column headers and the block's subtotal/total lines).`;

    const response = await ai.models.generateContent({
        model: RECEIPT_EXTRACTION_MODEL,
        contents: [
            {
                parts: [
                    { text: prompt },
                    {
                        inlineData: {
                            mimeType: 'image/jpeg',
                            data: base64Data,
                        },
                    },
                ],
            },
        ],
        config: {
            responseMimeType: 'application/json',
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    orders: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                order_id: { type: Type.NUMBER },
                                order_total_amount: { type: Type.NUMBER },
                                items: {
                                    type: Type.ARRAY,
                                    items: {
                                        type: Type.OBJECT,
                                        properties: {
                                            item_name: { type: Type.STRING },
                                            quantity: { type: Type.NUMBER },
                                            menu_selection: { type: Type.STRING },
                                            line_price: { type: Type.NUMBER },
                                        },
                                        required: ['item_name', 'quantity', 'menu_selection', 'line_price'],
                                    },
                                },
                            },
                            required: ['order_id', 'items', 'order_total_amount'],
                        },
                    },
                    receipt_grand_total: { type: Type.NUMBER },
                    extracted_items_sum: { type: Type.NUMBER },
                    math_match: { type: Type.BOOLEAN },
                },
                required: ['orders', 'receipt_grand_total', 'extracted_items_sum', 'math_match'],
            },
        },
    });

    const text = response.text;
    if (!text) throw new Error('No data extracted from receipt.');
    const parsed = JSON.parse(text) as {
        orders?: unknown;
        receipt_grand_total?: number;
        extracted_items_sum?: number;
        math_match?: boolean;
    };

    if (!Array.isArray(parsed.orders) || parsed.orders.length === 0) {
        throw new Error('Invalid extraction result: no orders.');
    }

    const normalizedOrders: ReceiptOrderGroup[] = [];
    for (const rawOrder of parsed.orders) {
        const ro = rawOrder as {
            order_id?: number;
            items?: unknown;
            order_total_amount?: number;
        };

        const rawItems = Array.isArray(ro.items) ? ro.items : [];
        const cleanedItems: ReceiptOrderGroup['items'] = [];
        for (const raw of rawItems) {
            const it = raw as {
                item_name?: string;
                quantity?: number;
                menu_selection?: string;
                line_price?: number;
            };
            const item_name = cleanExtractedOrderName(String(it.item_name ?? '')) || String(it.item_name ?? '').trim();
            if (!item_name || isJunkLineName(item_name)) continue;
            const quantity = Number(it.quantity);
            const q = Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
            const line_price = Number(it.line_price);
            const lp = Number.isFinite(line_price) ? line_price : 0;
            cleanedItems.push({
                item_name,
                quantity: q,
                menu_selection: cleanMenuSelection(String(it.menu_selection ?? '')),
                line_price: lp,
            });
        }
        if (cleanedItems.length === 0) continue;

        normalizedOrders.push({
            order_id: 0,
            items: cleanedItems,
            order_total_amount: 0,
        });
    }

    if (normalizedOrders.length === 0) {
        throw new Error('Invalid extraction result: no line items.');
    }

    const renumbered = normalizedOrders.map((o, idx) => {
        const sumLines = o.items.reduce((s, x) => s + x.line_price, 0);
        return {
            order_id: idx + 1,
            items: o.items.map((it) => ({ ...it })),
            order_total_amount: sumLines,
        };
    });

    const flat: ReceiptOrderItemNormalized[] = [];
    for (const o of renumbered) {
        for (const it of o.items) {
            flat.push({
                item_name: it.item_name,
                quantity: it.quantity,
                menu_selection: it.menu_selection,
                line_price: it.line_price,
                order_id: o.order_id,
            });
        }
    }

    const recomputedSum = flat.reduce((s, i) => s + i.line_price, 0);
    const receiptGrand = Number(parsed.receipt_grand_total);
    let receipt_grand_total = Number.isFinite(receiptGrand) && receiptGrand > 0 ? receiptGrand : recomputedSum;
    if (renumbered.length > 1) {
        receipt_grand_total = recomputedSum;
    }
    const extracted_items_sum = recomputedSum;
    const math_match = Math.abs(receipt_grand_total - extracted_items_sum) <= 2;

    return {
        orders: renumbered,
        items: flat,
        receipt_grand_total,
        extracted_items_sum,
        math_match,
    };
}
