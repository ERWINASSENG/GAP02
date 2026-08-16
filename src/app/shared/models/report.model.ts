export interface ReportOperationRubric {
  type: string;
  amount: number;
}

export interface CustomReportItem {
  id?: string;
  label: string;
  amount: number;
}

export interface DailyReport {
  id?: string;
  site: string;
  date: string; // YYYY-MM-DD
  week_id?: string;
  // Rubriques dynamiques issues des tableaux d'opérations de la semaine
  operation_rubrics?: ReportOperationRubric[];
  // Rétrocompatibilité / champs historiques
  total_chargements?: number;
  total_transferts?: number;
  total_son?: number;
  total_dechargements?: number;
  custom_items?: CustomReportItem[];
  total_general: number;
  effectif_declare: number;
  presents_noms: string;
  remarques?: string;
  created_at?: string;
  updated_at?: string;
  user_id?: string;
}

export interface CalculatedReportTotals {
  rubrics: ReportOperationRubric[];
  totalGeneral: number;
}
