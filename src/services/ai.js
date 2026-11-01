'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { z } = require('zod');

const SYSTEM_PROMPT = fs.readFileSync(
  path.join(__dirname, '..', 'prompts', 'extraer-pedido.v1.md'), 'utf8'
);

// ---------- contrato de salida ----------
const ItemSchema = z.object({
  descripcion_raw: z.string().min(1),
  cantidad: z.number().positive(),
  unidad: z.string().min(1),
  sku_sugerido: z.string().nullable(),
});
const SalidaSchema = z.object({
  items: z.array(ItemSchema),
  cliente: z.object({
    nombre: z.string().nullable(),
    telefono: z.string().nullable(),
    email: z.string().nullable(),
  }),
  missing_fields: z.array(z.string()),
  notas: z.string().nullable(),
});

const JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items', 'cliente', 'missing_fields', 'notas'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['descripcion_raw', 'cantidad', 'unidad', 'sku_sugerido'],
        properties: {
          descripcion_raw: { type: 'string' },
          cantidad: { type: 'number' },
          unidad: { type: 'string' },
          sku_sugerido: { type: ['string', 'null'] },
        },
      },
    },
    cliente: {
      type: 'object',
      additionalProperties: false,
      required: ['nombre', 'telefono', 'email'],
      properties: {
        nombre: { type: ['string', 'null'] },
        telefono: { type: ['string', 'null'] },
        email: { type: ['string', 'null'] },
      },
    },
    missing_fields: { type: 'array', items: { type: 'string' } },
    notas: { type: ['string', 'null'] },
  },
};

// ---------- modo degradado determinístico ----------
const UNIDADES = /(unidades?|u|kg|kilos?|mts?|metros?|bolsas?|barras?|baldes?|latas?|cartuchos?|pares?|litros?|lts?)/i;

function unidadDe(txt) {
  const m = txt.match(UNIDADES);
  if (!m) return 'unidad';
  const u = m[1].toLowerCase();
  if (/^m(ts|etros)?$/.test(u)) return 'metro';
  if (/^bolsa/.test(u)) return 'bolsa';
  if (/^barra/.test(u)) return 'barra';
  if (/^balde/.test(u)) return 'balde';
  if (/^lata/.test(u)) return 'lata';
  if (/^cartucho/.test(u)) return 'cartucho';
  if (/^par/.test(u)) return 'par';
  if (/^(kg|kilo)/.test(u)) return 'kg';
  if (/^(litro|lts?)/.test(u)) return 'litro';
  return 'unidad';
}

function degradeExtract(rawText) {
  const texto = String(rawText || '').trim();
  const base = {
    items: [],
    cliente: { nombre: null, telefono: null, email: null },
    missing_fields: [],
    notas: 'Modo degradado: extracción por reglas, sin modelo.',
  };
  if (!texto) return { ...base, missing_fields: ['descripcion'] };

  const email = (texto.match(/[\w.+-]+@[\w-]+\.[\w.]+/) || [null])[0];
  const tel = (texto.match(/(?:\+?54\s?9?\s?)?\d{2,4}[\s-]?\d{3}[\s-]?\d{4}/) || [null])[0];
  if (email) base.cliente.email = email;
  if (tel) base.cliente.telefono = tel;

  // protege la coma decimal argentina (2x1,5) antes de partir el texto
  const limpio = texto
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, ' ')
    .replace(/(\d),(\d)/g, '$1.$2');
  const trozos = limpio.split(/\s*(?:,|;|\n|\+|\by\b|\btambien\b|\btambién\b)\s*/i);
  for (const trozo of trozos) {
    const m = trozo.match(/(\d+(?:[.,]\d+)?)\s*(x\s*)?/i);
    if (!m) continue;
    const cantidad = Number(String(m[1]).replace(',', '.'));
    if (!(cantidad > 0)) continue;
    let resto = trozo.slice(m.index + m[0].length);
    const uni = resto.match(/^\s*(unidades?|u|kg|kilos?|mts?|metros?|bolsas?|barras?|baldes?|latas?|cartuchos?|pares?|litros?|lts?)\b\.?\s*/i);
    const unidad = uni ? unidadDe(uni[1]) : 'unidad';
    if (uni) resto = resto.slice(uni[0].length);
    // corta la cola conversacional ("? soy Juan", ". gracias") sin partir decimales (2x1.5)
    const descripcion = resto
      .replace(/^(de|del|la|el|los|las)\s+/i, '')
      .split(/[?!]/)[0]
      .replace(/\.\s+.*$/, '')
      .replace(/\.$/, '')
      .trim();
    if (descripcion.length < 3) continue;
    if (!/[a-záéíóúñ]/i.test(descripcion)) continue;
    if (/^(hola|buenas|buen dia|buenas tardes|gracias|soy)\b/i.test(descripcion)) continue;
    base.items.push({
      descripcion_raw: descripcion,
      cantidad,
      unidad,
      sku_sugerido: null,
    });
  }
  if (!base.items.length) base.missing_fields.push('descripcion');
  return base;
}

// ---------- cliente OpenAI ----------
let client = null;
let cachedModel = null;

function getClient() {
  if (client) return client;
  if (!process.env.OPENAI_API_KEY) return null;
  const OpenAI = require('openai');
  const Ctor = OpenAI.default || OpenAI;
  client = new Ctor({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: Number(process.env.AI_TIMEOUT_MS || 20000),
    maxRetries: 0,
  });
  return client;
}

const PREFERRED = ['gpt-4o-mini', 'gpt-4.1-mini', 'gpt-5-mini', 'gpt-4o'];

async function pickModel(api) {
  if (process.env.OPENAI_MODEL) return process.env.OPENAI_MODEL;
  if (cachedModel) return cachedModel;
  try {
    const list = await api.models.list();
    const ids = new Set((list.data || []).map(m => m.id));
    cachedModel = PREFERRED.find(m => ids.has(m)) || [...ids].find(m => m.startsWith('gpt-4')) || PREFERRED[0];
  } catch {
    cachedModel = PREFERRED[0];
  }
  return cachedModel;
}

function validar(data) {
  const parsed = SalidaSchema.safeParse(data);
  return parsed.success ? { ok: true, data: parsed.data } : { ok: false, issues: parsed.error.issues };
}

async function callModel(api, model, rawText, extraMessages = []) {
  const t0 = Date.now();
  const r = await api.chat.completions.create({
    model,
    temperature: 0.1,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      ...extraMessages,
      { role: 'user', content: rawText },
    ],
    response_format: { type: 'json_schema', json_schema: { name: 'pedido', strict: true, schema: JSON_SCHEMA } },
  });
  const latency_ms = Date.now() - t0;
  const content = r.choices?.[0]?.message?.content || '';
  let parsed = null;
  try { parsed = JSON.parse(content); } catch { /* cae a validacion */ }
  return {
    parsed,
    meta: {
      model,
      latency_ms,
      prompt_tokens: r.usage?.prompt_tokens || 0,
      completion_tokens: r.usage?.completion_tokens || 0,
    },
  };
}

async function extractOrder(rawText) {
  const api = getClient();
  if (!api) {
    return {
      data: degradeExtract(rawText),
      meta: { mode: 'degraded', model: null, latency_ms: 0, prompt_tokens: 0, completion_tokens: 0, repair_attempts: 0, error: 'OPENAI_API_KEY ausente' },
    };
  }
  const model = await pickModel(api);
  let repair = 0;
  try {
    let { parsed, meta } = await callModel(api, model, rawText);
    let v = validar(parsed);
    if (!v.ok) {
      repair = 1;
      const fix = await callModel(api, model, rawText, [
        { role: 'assistant', content: JSON.stringify(parsed) },
        { role: 'user', content: `Tu salida no cumple el schema. Errores: ${JSON.stringify(v.issues).slice(0, 800)}. Devolvé SOLO el JSON corregido.` },
      ]);
      meta = { ...meta, latency_ms: meta.latency_ms + fix.meta.latency_ms };
      parsed = fix.parsed;
      v = validar(parsed);
    }
    if (!v.ok) throw new Error('schema_invalido_tras_reparacion');
    return { data: v.data, meta: { ...meta, mode: 'live', repair_attempts: repair, error: null } };
  } catch (err) {
    return {
      data: degradeExtract(rawText),
      meta: { mode: 'degraded', model, latency_ms: 0, prompt_tokens: 0, completion_tokens: 0, repair_attempts: repair, error: String(err.message || err).slice(0, 300) },
    };
  }
}

module.exports = { extractOrder, degradeExtract, validar, SalidaSchema, JSON_SCHEMA, SYSTEM_PROMPT, getClient, pickModel };
