import { supabase } from '../server/supabase.js';

async function inspect() {
  if (!supabase) {
    console.error('Supabase client is not initialized');
    return;
  }

  // 試すテーブル名のリスト
  const tables = ['ingredients', 'fridge', 'refrigerator', 'items', 'foods', 'recipes'];
  
  console.log('Testing connection...');
  
  for (const table of tables) {
    try {
      const { data, error } = await supabase.from(table).select('*').limit(3);
      if (error) {
        console.log(`Table "${table}": Error ->`, error.message);
      } else {
        console.log(`Table "${table}": Found! Rows count:`, data.length);
        console.log('Sample data:', data);
      }
    } catch (err) {
      console.log(`Table "${table}": Exception ->`, err.message);
    }
  }
}

inspect();
