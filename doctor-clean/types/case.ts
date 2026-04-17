// Clinical Case Types - Production Ready
// Strict TypeScript interfaces for case management

export interface Procedure {
  id: string;
  title: string;
  tooth?: string;
  sessions?: number;
  price?: number;
  notes?: string;
}

export interface Case {
  id: string;
  patientName: string;
  primaryDoctorId: string;
  diagnosisCode?: string;
  diagnosisNote?: string;
  procedures: Procedure[];
  status: "DRAFT" | "ACTIVE" | "COMPLETED";
  escalated: boolean;
  updatedAt: string;
}

export interface AuthUser {
  id: string;
  name: string;
  role: string;
}
