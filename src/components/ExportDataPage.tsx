import { todayIso } from '../data/dateUtils';
import React, { useMemo, useState } from 'react';
import { Download, PackageCheck, CheckSquare, Square, ListChecks, AlertCircle, Loader2, CheckCircle2, RefreshCw, FileArchive } from 'lucide-react';
import JSZip from 'jszip';
import { buildCsvDocument } from '../data/fileImportUtils';
import { ExportDataset, ExportDataBag, buildExportDatasets, EXPORT_SECTIONS_ORDER } from '../data/exportModel';

interface ExportDataPageProps extends ExportDataBag {
  onNavigateToDashboard: () => void;
  isDarkMode?: boolean;
}

const primaryButtonClass =
  'inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-2xs transition active:scale-98 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed';
const secondaryButtonClass =
  'inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/80 text-xs font-semibold text-gray-700 dark:text-gray-200 shadow-2xs transition active:scale-98 cursor-pointer';


export const ExportDataPage: React.FC<ExportDataPageProps> = (props) => {
  const { onNavigateToDashboard } = props;
  const datasets = useMemo<ExportDataset[]>(() => buildExportDatasets(props), [props]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(datasets.map((d) => d.id)));
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const sections = useMemo(() => {
    const map = new Map<string, ExportDataset[]>();
    datasets.forEach((d) => {
      const list = map.get(d.section) ?? [];
      list.push(d);
      map.set(d.section, list);
    });
    return EXPORT_SECTIONS_ORDER.filter((s) => map.has(s)).map((s) => ({ section: s, items: map.get(s)! }));
  }, [datasets]);

  const toggle = (id: string) => {
    setSuccessMessage(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSection = (items: ExportDataset[]) => {
    setSuccessMessage(null);
    const allSelected = items.every((d) => selected.has(d.id));
    setSelected((prev) => {
      const next = new Set(prev);
      items.forEach((d) => (allSelected ? next.delete(d.id) : next.add(d.id)));
      return next;
    });
  };

  const handleSelectAll = () => {
    setSuccessMessage(null);
    setSelected(new Set(datasets.map((d) => d.id)));
  };
  const handleSelectNone = () => {
    setSuccessMessage(null);
    setSelected(new Set());
  };

  const selectedDatasets = useMemo(() => datasets.filter((d) => selected.has(d.id)), [datasets, selected]);
  const totalRows = useMemo(() => selectedDatasets.reduce((sum, d) => sum + d.count, 0), [selectedDatasets]);

  const handleExport = async () => {
    if (selectedDatasets.length === 0 || isExporting) return;
    setIsExporting(true);
    setExportError(null);
    setSuccessMessage(null);
    try {
      const zip = new JSZip();
      selectedDatasets.forEach((d) => {
        zip.file(d.filename, '\uFEFF' + buildCsvDocument(d.rows));
      });
      const blob = await zip.generateAsync({ type: 'blob' });
      const filename = `export_cafe_noir_${todayIso()}.zip`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setSuccessMessage(`${selectedDatasets.length} fichier${selectedDatasets.length > 1 ? 's' : ''} exporté${selectedDatasets.length > 1 ? 's' : ''} dans ${filename}.`);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Une erreur est survenue lors de la génération du fichier ZIP.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
            <span>Export</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
              Rapports et analyses
            </span>
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 max-w-2xl">
            Sélectionnez les données à exporter, puis téléchargez un fichier ZIP contenant un fichier CSV par catégorie sélectionnée.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          <button onClick={handleSelectAll} className={secondaryButtonClass}>
            <CheckSquare size={14} className="text-gray-500 dark:text-gray-400" />
            <span>Tout sélectionner</span>
          </button>
          <button onClick={handleSelectNone} className={secondaryButtonClass}>
            <Square size={14} className="text-gray-500 dark:text-gray-400" />
            <span>Tout désélectionner</span>
          </button>
          <button
            onClick={onNavigateToDashboard}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-300 dark:border-emerald-700/80 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 text-xs font-semibold text-emerald-700 dark:text-emerald-300 transition active:scale-98 cursor-pointer"
          >
            <span>Tableau de bord</span>
          </button>
        </div>
      </div>

      {exportError && (
        <div className="p-3.5 rounded-2xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/60 text-red-700 dark:text-red-300 text-xs flex items-center gap-2">
          <AlertCircle size={15} className="shrink-0" />
          <span className="flex-1">{exportError}</span>
          <button onClick={handleExport} className="inline-flex items-center gap-1 font-semibold hover:underline cursor-pointer shrink-0"><RefreshCw size={12} /> Réessayer</button>
        </div>
      )}
      {successMessage && (
        <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 size={15} className="shrink-0" /> {successMessage}
        </div>
      )}

      {sections.map(({ section, items }) => {
        const allSelected = items.every((d) => selected.has(d.id));
        return (
          <div key={section} className="rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs overflow-hidden">
            <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-gray-100 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-800/40">
              <div className="flex items-center gap-2">
                <ListChecks size={14} className="text-emerald-500" />
                <h2 className="text-xs font-bold text-gray-900 dark:text-white">{section}</h2>
              </div>
              <button onClick={() => toggleSection(items)} className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer">
                {allSelected ? 'Tout décocher' : 'Tout cocher'}
              </button>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-gray-800/60">
              {items.map((d) => {
                const checked = selected.has(d.id);
                return (
                  <label key={d.id} className="flex items-start gap-3 px-4 sm:px-5 py-3 hover:bg-gray-50/60 dark:hover:bg-gray-800/30 transition cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(d.id)}
                      className="mt-0.5 w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-emerald-600 focus:ring-emerald-500 cursor-pointer shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-gray-900 dark:text-white">{d.label}</span>
                        <span className="px-1.5 py-0.5 rounded-md bg-gray-100 dark:bg-gray-800 text-[10px] font-bold text-gray-500 dark:text-gray-400">{d.count} élément{d.count > 1 ? 's' : ''}</span>
                        <span className="px-1.5 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/40 text-[10px] font-semibold text-blue-600 dark:text-blue-300 font-mono">{d.filename}</span>
                      </div>
                      <p className="text-[11px] text-gray-400 mt-0.5">{d.description}</p>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Sticky export summary bar */}
      <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-2xl bg-emerald-50/80 dark:bg-emerald-950/40 flex items-center justify-center text-emerald-500 shrink-0">
            <FileArchive size={20} />
          </span>
          <div>
            <p className="text-xs font-semibold text-gray-900 dark:text-white">
              {selectedDatasets.length} catégorie{selectedDatasets.length > 1 ? 's' : ''} sélectionnée{selectedDatasets.length > 1 ? 's' : ''} sur {datasets.length}
            </p>
            <p className="text-[11px] text-gray-400">{totalRows} ligne{totalRows > 1 ? 's' : ''} de données au total</p>
          </div>
        </div>
        <button onClick={handleExport} disabled={selectedDatasets.length === 0 || isExporting} className={primaryButtonClass}>
          {isExporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          <span>{isExporting ? 'Génération du ZIP…' : 'Exporter en ZIP'}</span>
        </button>
      </div>

      {selectedDatasets.length === 0 && (
        <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-amber-700 dark:text-amber-300 text-xs flex items-center gap-2">
          <PackageCheck size={15} className="shrink-0" /> Sélectionnez au moins une catégorie de données pour activer l'export.
        </div>
      )}
    </div>
  );
};
