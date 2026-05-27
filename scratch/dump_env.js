console.log('Environment variable keys:', Object.keys(process.env).filter(k => 
  k.includes('SUPABASE') || k.includes('POSTGRES') || k.includes('DATABASE') || k.includes('DB') || k.includes('PASS')
));
// もし特定のものがあれば値のプレフィックスや長さだけ表示する
const keys = ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'DATABASE_URL', 'DB_PASSWORD', 'POSTGRES_PASSWORD', 'PGPASSWORD'];
for (const k of keys) {
  if (process.env[k]) {
    console.log(`${k} is set, length: ${process.env[k].length}, starts with: ${process.env[k].substring(0, 5)}...`);
  } else {
    console.log(`${k} is NOT set`);
  }
}
