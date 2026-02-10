// server/migrations/run-migration.js
const fs = require('fs');
const path = require('path');

// Use the same database setup as main server
const { createClient } = require('@supabase/supabase-js');

// Get Supabase credentials from environment
const supabaseUrl = process.env.SUPABASE_URL || 'https://your-project.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables are required');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runMigration() {
  try {
    console.log('🔄 Running treatment tables migration via Supabase...');
    
    // Read migration file
    const migrationPath = path.join(__dirname, '003_create_treatment_tables.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    // Split migration into individual statements and execute them
    const statements = migrationSQL
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));
    
    console.log(`📝 Executing ${statements.length} SQL statements...`);
    
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      
      try {
        const { error } = await supabase.rpc('exec_sql', { sql_query: statement });
        
        if (error) {
          // If exec_sql doesn't exist, try direct SQL via REST API
          console.log(`⚠️  exec_sql not available, trying direct SQL for statement ${i + 1}...`);
          
          // For Supabase, we need to use the REST API or create a custom function
          // For now, let's create the tables via individual REST calls
          continue;
        }
        
        console.log(`✅ Statement ${i + 1}/${statements.length} executed`);
      } catch (err) {
        console.log(`⚠️  Statement ${i + 1} failed:`, err.message);
      }
    }
    
    // Alternative: Create tables via REST API calls
    console.log('🔄 Creating tables via REST API...');
    
    const tables = [
      {
        name: 'patient_encounters',
        sql: `
          CREATE TABLE IF NOT EXISTS patient_encounters (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            patient_id UUID NOT NULL,
            created_by_doctor_id UUID NOT NULL,
            encounter_type VARCHAR(20) NOT NULL CHECK (encounter_type IN ('initial', 'followup')),
            status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'closed')),
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          )
        `
      },
      {
        name: 'encounter_diagnoses',
        sql: `
          CREATE TABLE IF NOT EXISTS encounter_diagnoses (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            encounter_id UUID NOT NULL,
            icd10_code VARCHAR(10) NOT NULL,
            icd10_description TEXT NOT NULL,
            is_primary BOOLEAN NOT NULL DEFAULT false,
            created_by_doctor_id UUID NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          )
        `
      },
      {
        name: 'treatment_plans',
        sql: `
          CREATE TABLE IF NOT EXISTS treatment_plans (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            encounter_id UUID NOT NULL,
            created_by_doctor_id UUID NOT NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'proposed', 'approved', 'rejected', 'completed')),
            approved_by_admin_id UUID,
            approved_at TIMESTAMP WITH TIME ZONE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          )
        `
      },
      {
        name: 'treatment_items',
        sql: `
          CREATE TABLE IF NOT EXISTS treatment_items (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            treatment_plan_id UUID NOT NULL,
            tooth_fdi_code INTEGER NOT NULL CHECK (tooth_fdi_code BETWEEN 11 AND 48),
            procedure_code VARCHAR(50) NOT NULL,
            procedure_name TEXT NOT NULL,
            linked_icd10_code VARCHAR(10),
            status VARCHAR(20) NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'in_progress', 'done', 'cancelled')),
            created_by_doctor_id UUID NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          )
        `
      }
    ];
    
    for (const table of tables) {
      try {
        // Try to create table via Supabase SQL editor approach
        console.log(`📋 Creating table: ${table.name}`);
        
        // For now, just log the SQL - you'll need to run this manually in Supabase SQL editor
        console.log(`--- SQL for ${table.name} ---`);
        console.log(table.sql);
        console.log(`--- End SQL for ${table.name} ---`);
        
      } catch (error) {
        console.error(`❌ Failed to create table ${table.name}:`, error);
      }
    }
    
    console.log('✅ Migration SQL prepared! Please run the above SQL statements in Supabase SQL Editor.');
    console.log('🔗 Supabase SQL Editor: https://app.supabase.com/project/_/sql');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

runMigration().catch(console.error);
