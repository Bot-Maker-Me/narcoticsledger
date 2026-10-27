import { useState, useMemo } from 'react';
import { Download, FileText, Calendar, Scale, Package, TrendingUp, Filter, Printer, ChevronDown, BarChart3, PieChart } from 'lucide-react';
import { useDrugs } from '@/hooks/useDrugs';
import { usePrescriptions } from '@/hooks/usePrescriptions';
import { useReconciliationCycles } from '@/hooks/useReconciliation';
import { useAllReconciliationItems } from '@/hooks/useReconciliation';
import { exportToCSV, exportToPDF } from '@/lib/exportUtils';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart as RechartsPieChart, Pie, Cell, BarChart, Bar } from 'recharts';
import { motion } from 'framer-motion';
import type { ReconciliationItemDraft } from '@/types/reconciliation';
import SectionMarker from '@/components/SectionMarker';

const chartTooltip = {
  contentStyle: {
    background: '#121A2B',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: 10,
    fontSize: 12,
  },
  labelStyle: { color: '#F5F7FB' },
  itemStyle: { color: '#B4BCCC' },
};

type ReportType = 'inventory' | 'dispensing' | 'reconciliation' | 'prescription' | 'schedule';

export default function Reports() {
  const { data: drugs } = useDrugs();
  const { data: prescriptions } = usePrescriptions();
  const { data: cycles } = useReconciliationCycles();
  const { data: allReconciliationItems } = useAllReconciliationItems();

  const [selectedReport, setSelectedReport] = useState<ReportType>('inventory');
  const [dateRange, setDateRange] = useState<'7d' | '30d' | '90d' | 'all'>('30d');
  const [showFilters, setShowFilters] = useState(false);

  // Prepare data for different reports
  const inventoryData = useMemo(() => {
    if (!drugs) return [];
    return drugs.map(drug => ({
      din: drug.din,
      description: drug.description,
      schedule: drug.schedule,
      currentStock: drug.current_stock,
      reorderLevel: drug.reorder_level,
      packSize: drug.pack_size,
    }));
  }, [drugs]);

  const dispensingData = useMemo(() => {
    if (!prescriptions) return [];
    return prescriptions.filter(p => p.status === 'active' || p.status === 'completed').map(rx => ({
      patientName: rx.patient_name,
      drugDescription: rx.drug_description,
      drugDIN: rx.drug_din,
      quantityPrescribed: rx.quantity_prescribed,
      quantityDispensed: rx.quantity_dispensed,
      prescriber: rx.prescriber,
      status: rx.status,
      createdAt: rx.created_at,
    }));
  }, [prescriptions]);

  const reconciliationData = useMemo(() => {
    if (!allReconciliationItems) return [];
    return allReconciliationItems.map(item => ({
      din: item.din,
      description: item.description || 'Unknown',
      schedule: item.schedule || 'Unknown',
      openingBalance: item.opening_balance,
      purchasedCount: item.purchased_count,
      dispensedCount: item.dispensed_count,
      actualCount: item.actual_count,
      flag: item.flag,
      cycleDate: item.cycle_created_at,
    }));
  }, [allReconciliationItems]);

  const scheduleDistribution = useMemo(() => {
    if (!drugs) return [];
    const scheduleCounts = drugs.reduce((acc, drug) => {
      acc[drug.schedule] = (acc[drug.schedule] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const colors = ['#E85A5A', '#8E9FC4', '#D6A85F', '#7BA88B', '#6B7DA6'];
    
    return Object.entries(scheduleCounts).map(([name, value], index) => ({
      name,
      value,
      color: colors[index % colors.length],
    }));
  }, [drugs]);

  const inventoryTrends = useMemo(() => {
    if (!drugs) return [];
    const topDrugs = drugs
      .sort((a, b) => b.current_stock - a.current_stock)
      .slice(0, 10);
    
    return topDrugs.map(drug => ({
      name: drug.description.substring(0, 15) + (drug.description.length > 15 ? '...' : ''),
      stock: drug.current_stock,
      reorder: drug.reorder_level,
    }));
  }, [drugs]);

  const handleExportCSV = () => {
    let data: any[] = [];
    let filename = 'report.csv';

    switch (selectedReport) {
      case 'inventory':
        data = inventoryData;
        filename = 'inventory-report.csv';
        break;
      case 'dispensing':
        data = dispensingData;
        filename = 'dispensing-report.csv';
        break;
      case 'reconciliation':
        data = reconciliationData;
        filename = 'reconciliation-report.csv';
        break;
      case 'prescription':
        data = dispensingData;
        filename = 'prescription-report.csv';
        break;
      case 'schedule':
        data = scheduleDistribution;
        filename = 'schedule-distribution.csv';
        break;
    }

    if (data.length > 0) {
      const headers = Object.keys(data[0]);
      const rows = data.map(row => headers.map(header => `"${row[header]}"`).join(','));
      const csvContent = [headers.join(','), ...rows].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      link.click();
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div>
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <SectionMarker index="01" label="Reports" />
          <h1 className="mt-4 font-display text-3xl text-neutral-900">Reports & Analytics</h1>
          <p className="mt-1 text-sm text-neutral-500">Generate and export compliance reports</p>
        </div>
        <div className="mt-4 flex items-center gap-2 sm:mt-0">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="btn-secondary"
          >
            <Filter className="h-4 w-4" />
            Filters
          </button>
          <button onClick={handleExportCSV} className="btn-secondary">
            <Download className="h-4 w-4" />
            Export CSV
          </button>
          <button onClick={handlePrint} className="btn-secondary">
            <Printer className="h-4 w-4" />
            Print
          </button>
        </div>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="mb-6 card p-4"
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-neutral-700">Report Type</label>
              <select
                value={selectedReport}
                onChange={(e) => setSelectedReport(e.target.value as ReportType)}
                className="input-field"
              >
                <option value="inventory">Controlled Substance Inventory Log</option>
                <option value="dispensing">Dispensing Report</option>
                <option value="reconciliation">Reconciliation Summary</option>
                <option value="prescription">Prescription Activity</option>
                <option value="schedule">Schedule Distribution</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-neutral-700">Date Range</label>
              <select
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value as '7d' | '30d' | '90d' | 'all')}
                className="input-field"
              >
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
                <option value="90d">Last 90 days</option>
                <option value="all">All time</option>
              </select>
            </div>
            <div className="flex items-end">
              <button className="btn-primary w-full">
                Apply Filters
              </button>
            </div>
          </div>
        </motion.div>
      )}

      {/* Report Type Selector */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <ReportButton
          active={selectedReport === 'inventory'}
          icon={Package}
          label="Inventory"
          onClick={() => setSelectedReport('inventory')}
        />
        <ReportButton
          active={selectedReport === 'dispensing'}
          icon={FileText}
          label="Dispensing"
          onClick={() => setSelectedReport('dispensing')}
        />
        <ReportButton
          active={selectedReport === 'reconciliation'}
          icon={Scale}
          label="Reconciliation"
          onClick={() => setSelectedReport('reconciliation')}
        />
        <ReportButton
          active={selectedReport === 'prescription'}
          icon={Calendar}
          label="Prescriptions"
          onClick={() => setSelectedReport('prescription')}
        />
        <ReportButton
          active={selectedReport === 'schedule'}
          icon={PieChart}
          label="Schedule"
          onClick={() => setSelectedReport('schedule')}
        />
      </div>

      {/* Report Content */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Main Report Table */}
        <div className="card p-6 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-neutral-900">
              {getReportTitle(selectedReport)}
            </h2>
            <span className="text-sm text-neutral-500">
              {getRecordCount(selectedReport, inventoryData, dispensingData, reconciliationData)} records
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-neutral-100 bg-neutral-50/50">
                  {getReportHeaders(selectedReport).map((header, i) => (
                    <th key={i} className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-50">
                {getReportData(selectedReport, inventoryData, dispensingData, reconciliationData).map((row, i) => (
                  <tr key={i} className="transition-colors hover:bg-neutral-50/50">
                    {Object.values(row).map((cell, j) => (
                      <td key={j} className="px-3 py-2.5 text-sm text-neutral-700">
                        {String(cell ?? '')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Charts and Analytics */}
        <div className="space-y-6">
          {/* Schedule Distribution Chart */}
          <div className="card p-6">
            <h3 className="text-sm font-semibold text-neutral-800 mb-4">Schedule Distribution</h3>
            {scheduleDistribution.length > 0 ? (
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsPieChart>
                    <Pie
                      data={scheduleDistribution}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={60}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {scheduleDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip {...chartTooltip} />
                  </RechartsPieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex h-48 items-center justify-center text-neutral-400">
                <p className="text-sm">No data available</p>
              </div>
            )}
            {scheduleDistribution.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {scheduleDistribution.map((item) => (
                  <div key={item.name} className="flex items-center gap-1">
                    <div 
                      className="h-2 w-2 rounded-full" 
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="text-xs text-neutral-600">{item.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Inventory Trends Chart */}
          <div className="card p-6">
            <h3 className="text-sm font-semibold text-neutral-800 mb-4">Top 10 Inventory Levels</h3>
            {inventoryTrends.length > 0 ? (
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={inventoryTrends}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255, 255, 255, 0.08)" />
                    <XAxis 
                      dataKey="name" 
                      tick={{ fill: '#98A2B8', fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis 
                      tick={{ fill: '#98A2B8', fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip {...chartTooltip} />
                    <Bar dataKey="stock" fill="#E85A5A" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex h-48 items-center justify-center text-neutral-400">
                <p className="text-sm">No data available</p>
              </div>
            )}
          </div>

          {/* Summary Stats */}
          <div className="card p-6">
            <h3 className="text-sm font-semibold text-neutral-800 mb-4">Summary Statistics</h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-neutral-500">Total Drugs</span>
                <span className="text-sm font-semibold text-neutral-800">{drugs?.length || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-neutral-500">Active Prescriptions</span>
                <span className="text-sm font-semibold text-neutral-800">{prescriptions?.filter(p => p.status === 'active').length || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-neutral-500">Completed Cycles</span>
                <span className="text-sm font-semibold text-neutral-800">{cycles?.filter(c => c.status === 'completed').length || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-neutral-500">Low Stock Items</span>
                <span className="text-sm font-semibold text-error-600">{drugs?.filter(d => d.current_stock <= d.reorder_level).length || 0}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReportButton({ 
  active, 
  icon: Icon, 
  label, 
  onClick 
}: { 
  active: boolean; 
  icon: typeof Package; 
  label: string; 
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-2 rounded-lg border p-4 transition-all ${
        active 
          ? 'border-primary-200 bg-primary-50 text-primary-700' 
          : 'border-neutral-200 bg-surface text-neutral-600 hover:border-neutral-300 hover:bg-neutral-50'
      }`}
    >
      <Icon className="h-5 w-5" />
      <span className="text-xs font-medium">{label}</span>
    </button>
  );
}

function getReportTitle(type: ReportType): string {
  const titles = {
    inventory: 'Controlled Substance Inventory Log',
    dispensing: 'Dispensing Report',
    reconciliation: 'Reconciliation Summary',
    prescription: 'Prescription Activity Report',
    schedule: 'Schedule Distribution',
  };
  return titles[type];
}

function getReportHeaders(type: ReportType): string[] {
  const headers = {
    inventory: ['DIN', 'Description', 'Schedule', 'Current Stock', 'Reorder Level', 'Pack Size'],
    dispensing: ['Patient Name', 'Drug', 'DIN', 'Prescribed', 'Dispensed', 'Status', 'Date'],
    reconciliation: ['DIN', 'Description', 'Schedule', 'Opening', 'Purchased', 'Dispensed', 'Actual', 'Flag'],
    prescription: ['Patient Name', 'Drug', 'DIN', 'Prescriber', 'Prescribed', 'Dispensed', 'Status'],
    schedule: ['Schedule', 'Count', 'Percentage'],
  };
  return headers[type];
}

function getReportData(
  type: ReportType,
  inventoryData: any[],
  dispensingData: any[],
  reconciliationData: any[]
): any[] {
  switch (type) {
    case 'inventory':
      return inventoryData.slice(0, 20).map(item => ({
        din: item.din,
        description: item.description,
        schedule: item.schedule,
        currentStock: item.currentStock,
        reorderLevel: item.reorderLevel,
        packSize: item.packSize,
      }));
    case 'dispensing':
      return dispensingData.slice(0, 20).map(item => ({
        patientName: item.patientName,
        drugDescription: item.drugDescription,
        drugDIN: item.drugDIN,
        quantityPrescribed: item.quantityPrescribed,
        quantityDispensed: item.quantityDispensed,
        status: item.status,
        createdAt: new Date(item.createdAt).toLocaleDateString(),
      }));
    case 'reconciliation':
      return reconciliationData.slice(0, 20).map(item => ({
        din: item.din,
        description: item.description,
        schedule: item.schedule,
        openingBalance: item.openingBalance,
        purchasedCount: item.purchasedCount,
        dispensedCount: item.dispensedCount,
        actualCount: item.actualCount ?? '—',
        flag: item.flag,
      }));
    case 'prescription':
      return dispensingData.slice(0, 20).map(item => ({
        patientName: item.patientName,
        drugDescription: item.drugDescription,
        drugDIN: item.drugDIN,
        prescriber: item.prescriber,
        quantityPrescribed: item.quantityPrescribed,
        quantityDispensed: item.quantityDispensed,
        status: item.status,
      }));
    case 'schedule':
      const total = inventoryData.length;
      const scheduleCounts = inventoryData.reduce((acc, item) => {
        acc[item.schedule] = (acc[item.schedule] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      return (Object.entries(scheduleCounts) as [string, number][]).map(([schedule, count]) => ({
        schedule,
        count,
        percentage: ((count / total) * 100).toFixed(1) + '%',
      }));
    default:
      return [];
  }
}

function getRecordCount(
  type: ReportType,
  inventoryData: any[],
  dispensingData: any[],
  reconciliationData: any[]
): number {
  switch (type) {
    case 'inventory':
      return inventoryData.length;
    case 'dispensing':
    case 'prescription':
      return dispensingData.length;
    case 'reconciliation':
      return reconciliationData.length;
    case 'schedule':
      const scheduleCounts = inventoryData.reduce((acc, item) => {
        acc[item.schedule] = (acc[item.schedule] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      return Object.keys(scheduleCounts).length;
    default:
      return 0;
  }
}