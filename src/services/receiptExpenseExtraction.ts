import { GoogleGenAI, Type } from '@google/genai';

export const EXPENSE_RECEIPT_EXTRACTION_MODEL = 'gemini-2.5-flash';

export type ReceiptExpenseItem = {
  qty: number;
  name: string;
  price: number;
  category: string;
  unit?: string;
};

export type ReceiptExpenseExtractionResult = {
  items: ReceiptExpenseItem[];
  receipt_grand_total: number;
  extracted_items_sum: number;
  math_match: boolean;
};

export async function extractExpenseItemsFromReceiptImage(params: {
  imageDataUrl: string;
  apiKey: string;
  categories: string[];
}): Promise<ReceiptExpenseExtractionResult> {
  const ai = new GoogleGenAI({ apiKey: params.apiKey });
  const base64Data = params.imageDataUrl.split(',')[1];
  if (!base64Data) throw new Error('Invalid image data');

  const categoriesList = (Array.isArray(params.categories) ? params.categories : []).filter(Boolean).join(', ');
  const prompt = `The image may be a vertically stitched receipt from multiple photos. Read the full image top to bottom and include all line items.
Extract receipt into JSON. Rules:
(1) Each line item: description + final extended price only (no unit price).
(2) For each item's description (name), use format "Korean / English" with English in title case (e.g. 감자 / Potato, 당근 / Carrots). Use the most common Korean word for that ingredient/food.
(3) Extract the unit of measurement (unit) for each item from the receipt (e.g. KG, PACK, PCS, CASE, G, ML, L, BAG, BOX, BOTTLE, CAN, JAR, HEAD, BUNCH, CUP). If the receipt has a "Unit" column use it; otherwise infer from context (e.g. "3pcs" in description → PCS, "10 case" → CASE). Use uppercase 2–4 letter code.
(4) Decimals correct, no "P"/"Php"/"₱".
(5) Ignore header/footer (store, TIN, date, VAT, subtotal).
(6) Assign each item exactly one of these categories: ${categoriesList}.
(7) Grand total from receipt; sum items; set math_match if sum equals grand total.`;

  const response = await ai.models.generateContent({
    model: EXPENSE_RECEIPT_EXTRACTION_MODEL,
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
          items: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                qty: { type: Type.NUMBER },
                name: { type: Type.STRING },
                price: { type: Type.NUMBER },
                category: { type: Type.STRING },
                unit: { type: Type.STRING },
              },
              required: ['qty', 'name', 'price', 'category'],
            },
          },
          receipt_grand_total: { type: Type.NUMBER },
          extracted_items_sum: { type: Type.NUMBER },
          math_match: { type: Type.BOOLEAN },
        },
        required: ['items', 'receipt_grand_total', 'extracted_items_sum', 'math_match'],
      },
    },
  });

  const text = response.text;
  if (!text) throw new Error('No data extracted from receipt.');
  const parsed = JSON.parse(text) as ReceiptExpenseExtractionResult;
  if (!parsed || !Array.isArray(parsed.items)) throw new Error('Invalid extraction result');
  return parsed;
}

