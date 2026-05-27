import '../server/env.js';
import fs from 'fs';
import path from 'path';

const supabaseUrl = process.env.SUPABASE_URL;
const apiKey = process.env.SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !apiKey) {
  console.error('SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY is not defined in .env');
  process.exit(1);
}

async function fetchSchema() {
  const url = `${supabaseUrl}/rest/v1/`;
  try {
    const response = await fetch(url, {
      headers: {
        'apikey': apiKey,
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch schema: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log('--- Database OpenAPI Schema ---');
    console.log('Title:', data.info?.title);
    console.log('Paths:', Object.keys(data.paths || {}));
    if (data.definitions) {
      console.log('Definitions:', Object.keys(data.definitions));
      // 各定義のプロパティを表示
      for (const [name, def] of Object.entries(data.definitions)) {
        console.log(`\nTable: ${name}`);
        console.log('Properties:', Object.keys(def.properties || {}).map(p => `${p} (${def.properties[p].type})`));
      }
    }
  } catch (err) {
    console.error('Error fetching schema:', err);
  }
}

fetchSchema();
