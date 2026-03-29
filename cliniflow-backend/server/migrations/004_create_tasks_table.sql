-- Create tasks table for admin doctor task assignments
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  treatment_group_id UUID NOT NULL REFERENCES treatment_groups(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  assigned_doctor_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  created_by_admin_id UUID NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  
  -- Task details
  title VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'completed', 'cancelled')),
  priority VARCHAR(20) NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  
  -- Timestamps
  due_date TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Create indexes for performance
CREATE INDEX idx_tasks_treatment_group_id ON tasks(treatment_group_id);
CREATE INDEX idx_tasks_patient_id ON tasks(patient_id);
CREATE INDEX idx_tasks_assigned_doctor_id ON tasks(assigned_doctor_id);
CREATE INDEX idx_tasks_created_by_admin_id ON tasks(created_by_admin_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_due_date ON tasks(due_date);
CREATE INDEX idx_tasks_created_at ON tasks(created_at);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_tasks_updated_at 
  BEFORE UPDATE ON tasks 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create completed_at trigger
CREATE OR REPLACE FUNCTION set_completed_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    NEW.completed_at = NOW();
  ELSIF NEW.status != 'completed' THEN
    NEW.completed_at = NULL;
  END IF;
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER set_tasks_completed_at 
  BEFORE UPDATE ON tasks 
  FOR EACH ROW EXECUTE FUNCTION set_completed_at();

-- Add RLS policies
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- Policy: Admins can do everything with tasks
CREATE POLICY "Admins have full access to tasks" ON tasks
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM admins 
      WHERE admins.id = created_by_admin_id
    )
  );

-- Policy: Doctors can view and update their own tasks
CREATE POLICY "Doctors can view and update their tasks" ON tasks
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM patients 
      WHERE patients.id = assigned_doctor_id 
      AND patients.role = 'DOCTOR'
    )
  );

-- Policy: Doctors can update their own task status
CREATE POLICY "Doctors can update their task status" ON tasks
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM patients 
      WHERE patients.id = assigned_doctor_id 
      AND patients.role = 'DOCTOR'
    )
  )
  WITH CHECK (
    assigned_doctor_id = auth.uid() OR 
    (status IN ('in_progress', 'completed'))
  );

-- Add comments for documentation
COMMENT ON TABLE tasks IS 'Admin doctor task assignments within treatment groups';
COMMENT ON COLUMN tasks.treatment_group_id IS 'Treatment group context for the task';
COMMENT ON COLUMN tasks.patient_id IS 'Patient context for the task';
COMMENT ON COLUMN tasks.assigned_doctor_id IS 'Doctor assigned to the task';
COMMENT ON COLUMN tasks.created_by_admin_id IS 'Admin who created the task';
COMMENT ON COLUMN tasks.title IS 'Task title/description';
COMMENT ON COLUMN tasks.description IS 'Detailed task description';
COMMENT ON COLUMN tasks.status IS 'Task status: open, in_progress, completed, cancelled';
COMMENT ON COLUMN tasks.priority IS 'Task priority: low, medium, high, urgent';
COMMENT ON COLUMN tasks.due_date IS 'Task due date';
COMMENT ON COLUMN tasks.completed_at IS 'When task was completed';
COMMENT ON COLUMN tasks.metadata IS 'Additional task metadata';
