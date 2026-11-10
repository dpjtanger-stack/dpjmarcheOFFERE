/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { 
  FileText, 
  Upload, 
  Trash2, 
  Calculator, 
  TrendingDown, 
  TrendingUp, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle,
  Download,
  Plus,
  ArrowRight,
  Gavel,
  LayoutDashboard,
  Clock,
  History,
  Users,
  DownloadCloud,
  UploadCloud,
  Settings,
  MoreHorizontal,
  Building2,
  Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ReferenceLine, 
  ResponsiveContainer,
  Cell
} from 'recharts';
import { GoogleGenAI } from "@google/genai";
import { 
  Bidder, 
  BidderItem, 
  BordereauItem, 
  TenderMetadata, 
  TenderType,
  Project,
  DirectorateSettings,
  DEFAULT_DIRECTORATE
} from './types';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const GEMINI_KEY_FROM_ENV = (process.env.GEMINI_API_KEY as string);

const truncateTo2Decimals = (val: number): number => {
  if (isNaN(val) || !isFinite(val)) return 0;
  // Use multiplication with robust rounding to 5 decimal places before Math.trunc to avoid JS floating-point issues (e.g., 29.29 * 100 = 2928.9999999999995)
  return Math.trunc(Math.round(val * 100000) / 1000) / 100;
};

const formatAmount = (val: number | undefined | null): string => {
  if (val === undefined || val === null || isNaN(val)) return '0.00';
  const num = truncateTo2Decimals(val);
  return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const formatPercent = (val: number | undefined | null): string => {
  if (val === undefined || val === null || isNaN(val)) return '0.00';
  const num = truncateTo2Decimals(val);
  return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const fileToDataPart = async (file: File) => {
  return new Promise<{ inlineData: { data: string, mimeType: string } }>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      resolve({
        inlineData: {
          data: base64,
          mimeType: file.type
        }
      });
    };
    reader.onerror = (e) => reject(e);
    reader.readAsDataURL(file);
  });
};

const isElectron = typeof window !== 'undefined' && (
  /Electron/i.test(navigator.userAgent) || 
  Boolean((window as any).isElectron) || 
  Boolean((window as any).process?.versions?.electron)
);

const safeStorage = {
  getItem: (key: string): string | null => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(key);
      }
    } catch (e) {
      console.warn("Storage read error:", key, e);
    }
    return null;
  },
  setItem: (key: string, value: string): void => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, value);
      }
    } catch (e) {
      console.warn("Storage write error:", key, e);
    }
  }
};

export default function App() {
  const [view, setView] = useState<'dashboard' | 'editor'>('dashboard');
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  
  const [projects, setProjects] = useState<Project[]>(() => {
    const saved = safeStorage.getItem('tender_projects');
    return saved ? JSON.parse(saved) : [];
  });

  const [step, setStep] = useState(1);
  const [metadata, setMetadata] = useState<TenderMetadata>({
    tenderNumber: '',
    type: 'Travaux',
    estimation: 0,
    numBidders: 1,
    tvaRate: 20,
    isSpecialService: false
  });

  const [templateItems, setTemplateItems] = useState<BordereauItem[]>([]);
  const [bidders, setBidders] = useState<Bidder[]>([]);

  const [apiKeys, setApiKeys] = useState<string[]>(() => {
    const saved = safeStorage.getItem('gemini_api_keys');
    if (saved) return JSON.parse(saved);
    const legacy = safeStorage.getItem('gemini_api_key');
    return [legacy || GEMINI_KEY_FROM_ENV || '', '', ''];
  });
  const [currentKeyIndex, setCurrentKeyIndex] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  
  // Directorate Settings (Centralized & Persistent)
  const [directorate, setDirectorate] = useState<DirectorateSettings>(() => {
    try {
      const saved = safeStorage.getItem('app_directorate_settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.nameAr && parsed?.nameFr) {
          return parsed;
        }
      }
    } catch (e) {
      console.error("Error reading directorate settings:", e);
    }
    return DEFAULT_DIRECTORATE;
  });
  const [showDirectorateModal, setShowDirectorateModal] = useState(false);
  const [draftDirectorateAr, setDraftDirectorateAr] = useState("");
  const [draftDirectorateFr, setDraftDirectorateFr] = useState("");
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    if (directorate?.nameAr) {
      document.title = `${directorate.nameAr} - فتح الأظرفة : التحقق من حسابات العروض`;
    }
  }, [directorate]);

  const openDirectorateSettings = () => {
    setDraftDirectorateAr(directorate.nameAr);
    setDraftDirectorateFr(directorate.nameFr);
    setShowDirectorateModal(true);
  };

  const handleSaveDirectorate = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanAr = draftDirectorateAr.trim();
    const cleanFr = draftDirectorateFr.trim();
    if (!cleanAr || !cleanFr) {
      alert("يرجى إدخال اسم المديرية باللغتين العربية والفرنسية");
      return;
    }
    const updated: DirectorateSettings = {
      nameAr: cleanAr,
      nameFr: cleanFr,
    };
    setDirectorate(updated);
    try {
      safeStorage.setItem('app_directorate_settings', JSON.stringify(updated));
    } catch (err) {
      console.error("Error saving directorate settings:", err);
    }
    setShowDirectorateModal(false);
    setToastMessage("تم تحديث اسم المديرية بنجاح على مستوى البرنامج بالكامل");
    setTimeout(() => setToastMessage(null), 3000);
  };


  const ai = useMemo(() => {
    const activeKey = apiKeys[currentKeyIndex] || apiKeys.find(k => k) || 'MISSING_KEY';
    return new GoogleGenAI({ apiKey: activeKey });
  }, [apiKeys, currentKeyIndex]);

  const callGeminiWithRotation = async (prompt: string, filePart: any) => {
    let lastError: any = null;
    
    // Try starting from the first non-empty key
    const availableKeyIndices = apiKeys.map((k, i) => k ? i : -1).filter(i => i !== -1);
    
    if (availableKeyIndices.length === 0) {
      throw new Error("Aucune clé API Gemini n'est configurée. Veuillez ouvrir les réglages.");
    }

    for (const keyIndex of availableKeyIndices) {
      try {
        const currentAi = new GoogleGenAI({ apiKey: apiKeys[keyIndex] });
        
        // Use the pattern that was working before
        const response = await (currentAi as any).models.generateContent({
          model: "gemini-1.5-flash",
          contents: [
            {
              role: 'user',
              parts: [{ text: prompt }, filePart]
            }
          ]
        });
        
        // If successful, update the global active index for future calls
        setCurrentKeyIndex(keyIndex);
        return response;
      } catch (err: any) {
        lastError = err;
        const errMsg = err.message || JSON.stringify(err);
        
        // If it's a quota error, continue to next key
        if (errMsg.includes("429") || errMsg.includes("QUOTA_EXCEEDED") || errMsg.includes("RESOURCE_EXHAUSTED")) {
          console.warn(`Key ${keyIndex + 1} exhausted. Trying next key...`);
          continue;
        }
        
        // If it's an auth error (invalid key), continue to next key
        if (errMsg.includes("401") || errMsg.includes("API_KEY_INVALID")) {
          console.warn(`Key ${keyIndex + 1} is invalid. Trying next key...`);
          continue;
        }

        // For other errors, break and show to user
        throw err;
      }
    }
    
    // If we reached here, all keys failed
    if (lastError?.message?.includes("429")) {
      throw new Error("Quota épuisé sur toutes vos clés API. Veuillez patienter une minute ou ajouter d'autres clés.");
    }
    throw lastError;
  };

  const [isExtractingTemplate, setIsExtractingTemplate] = useState(false);
  const [extractingBidId, setExtractingBidId] = useState<string | null>(null);
  const [bidderNames, setBidderNames] = useState<Record<string, string>>({});

  const [searchQuery, setSearchQuery] = useState("");
  const [dateFilter, setDateFilter] = useState("");

  const exportDatabase = () => {
    const dataStr = JSON.stringify(projects, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    saveAs(blob, `finaudit_database_${new Date().toISOString().split('T')[0]}.json`);
  };

  const importDatabase = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e: any) => {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const imported = JSON.parse(event.target?.result as string);
          if (Array.isArray(imported)) {
            if (confirm(`Voulez-vous importer ${imported.length} projets ? Cela pourrait écraser les projets existants avec le même ID.`)) {
              setProjects(prev => {
                const combined = [...prev];
                imported.forEach(newProj => {
                  const idx = combined.findIndex(p => p.id === newProj.id);
                  if (idx !== -1) {
                    combined[idx] = newProj;
                  } else {
                    combined.push(newProj);
                  }
                });
                return combined;
              });
              alert("Importation réussie !");
            }
          }
        } catch (err) {
          alert("Erreur lors de l'importation. Format de fichier invalide.");
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const filteredProjects = projects.filter(p => {
    const matchesSearch = p.metadata.tenderNumber.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          p.bidders.some(b => b.companyName.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesDate = !dateFilter || new Date(p.createdAt).toLocaleDateString() === new Date(dateFilter).toLocaleDateString();
    
    return matchesSearch && matchesDate;
  });

  // Sync projects to localStorage
  React.useEffect(() => {
    safeStorage.setItem('tender_projects', JSON.stringify(projects));
  }, [projects]);

  // Load project into editor
  const loadProject = (project: Project) => {
    setCurrentProjectId(project.id);
    setMetadata(project.metadata);
    setTemplateItems(project.templateItems);
    setBidders(project.bidders);
    setStep(1);
    setView('editor');
  };

  // Save/Update current project in the list
  const saveCurrentProject = () => {
    if (!metadata.tenderNumber) {
      alert("Veuillez saisir le numéro de l'AO avant d'enregistrer.");
      return;
    }

    const now = Date.now();
    const newId = currentProjectId || Math.random().toString(36).substr(2, 9);
    
    const projectData: Project = {
      id: newId,
      createdAt: projects.find(p => p.id === currentProjectId)?.createdAt || now,
      updatedAt: now,
      metadata,
      templateItems,
      bidders
    };

    setProjects(prev => {
      const existingIdx = prev.findIndex(p => p.id === projectData.id);
      if (existingIdx !== -1) {
        const next = [...prev];
        next[existingIdx] = projectData;
        return next;
      } else {
        return [projectData, ...prev];
      }
    });

    if (!currentProjectId) {
      setCurrentProjectId(newId);
    }
  };

  // Auto-save effect
  React.useEffect(() => {
    if (view === 'editor' && metadata.tenderNumber) {
      const timer = setTimeout(() => {
        saveCurrentProject();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [metadata, templateItems, bidders, view]);

  const createNewProject = () => {
    setCurrentProjectId(null);
    setMetadata({ 
      tenderNumber: '', 
      type: 'Travaux', 
      estimation: 0, 
      numBidders: 1,
      tvaRate: 20,
      isSpecialService: false
    });
    setTemplateItems([]);
    setBidders([]);
    setBidderNames({});
    setStep(1);
    setView('editor');
  };

  const deleteProject = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (confirm("Supprimer ce projet ?")) {
      setProjects(prev => prev.filter(p => p.id !== id));
      if (currentProjectId === id) {
        setView('dashboard');
        setCurrentProjectId(null);
      }
    }
  };

  const resetAll = () => {
    if (confirm("Voulez-vous vraiment réinitialiser ce projet ?")) {
      setTemplateItems([]);
      setBidders([]);
      setBidderNames({});
      setStep(1);
    }
  };

  const handleTemplateUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsExtractingTemplate(true);
    try {
      const filePart = await fileToDataPart(file);
      const prompt = `Extract the structure of this construction tender "Bordereau des prix / Détail Estimatif" PDF. 
           Output ONLY a JSON array of objects with: 
           - itemReference (string, e.g. "1.1")
           - designation (string, full item name)
           - unit (string)
           - quantity (number)
           - referenceUnitPrice (number, optional, only if the estimation or unit price of the MO is present in this reference document)
           Ensure all items are included. Output ONLY a valid JSON array. Remove any markdown code blocks.`;

      const geminiTemplateResult = await callGeminiWithRotation(prompt, filePart);
      const text = geminiTemplateResult.text || geminiTemplateResult.response?.text?.() || "";
      const jsonStr = text.replace(/```json|```/g, "").trim();
      const data = JSON.parse(jsonStr);
      const items = data.map((i: any) => ({ 
        ...i, 
        quantity: Number(i.quantity) || 0,
        referenceUnitPrice: i.referenceUnitPrice ? Number(i.referenceUnitPrice) : undefined 
      }));
      setTemplateItems(items);
    } catch (err: any) {
      console.error(err);
      const msg = err.message || JSON.stringify(err);
      if (msg.includes("Clé API Gemini manquante")) {
        alert(msg);
      } else if (msg.includes("429") || msg.includes("QUOTA_EXCEEDED") || msg.includes("RESOURCE_EXHAUSTED")) {
        alert("Limite de quota atteinte (Erreur 429). Veuillez patienter une minute avant de réessayer. \n\nNote: La version gratuite de Google Gemini a des limites de fréquence.");
      } else {
        alert(`Erreur d'extraction: ${msg}\n\nVeuillez vérifier votre connexion internet et la validité de votre clé API Gemini dans les réglages.`);
      }
    } finally {
      setIsExtractingTemplate(false);
    }
  };

  const handleBidUpload = async (slotId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (templateItems.length === 0) {
      alert("Veuillez d'abord charger le modèle de bordereau.");
      return;
    }

    setExtractingBidId(slotId);
    try {
      const filePart = await fileToDataPart(file);
      const prompt = `Extract the financial data and the company name from this bidder's document (Bordereau des Prix / Détail Estimatif). 
           Match items to the following reference template structure: ${JSON.stringify(templateItems.slice(0, 10))}...
           
           CRITICAL RULES:
           1. IDENTIFY THE COMPANY NAME: Extract the name of the competing company (Concurrent / Entreprise). Look for it at the top or the very end of the document (near stamps/signatures).
           2. Extract the EXACT itemReference (e.g. 101, 1.1, A).
           3. Extract the QUANTITY exactly as written in the bidder's document.
           4. Extract the UNIT PRICE (Prix Unitaire) and the TOTAL announced for each row.
           
           Output ONLY a JSON object with:
           {
             "companyName": "string or null",
             "items": [ { "itemReference": "...", "designation": "...", "unit": "...", "quantity": 0, "unitPrice": 0, "total": 0 } ]
           }
           Ensure all numbers are clean. Output ONLY valid JSON. No markdown blocks.`;

      const geminiResultBid = await callGeminiWithRotation(prompt, filePart);
      const text = geminiResultBid.text || geminiResultBid.response?.text?.() || "";
      const jsonStr = text.replace(/```json|```/g, "").trim();
      const resultObj = JSON.parse(jsonStr);

      const itemsData = Array.isArray(resultObj) ? resultObj : (resultObj.items || []);
      const extractedName = !Array.isArray(resultObj) ? resultObj.companyName : null;

      // Update name automatically
      const slotIndex = parseInt(slotId.split('-')[1]) + 1;
      const finalName = extractedName || `المنافس رقم ${slotIndex}`;
      setBidderNames(prev => ({ ...prev, [slotId]: finalName }));

      if (!extractedName) {
        alert(`Note: Le nom du concurrent n'a pas été détecté automatiquement. Il a été nommé "${finalName}". Vous pouvez le modifier manuellement.`);
      }

      // Validation: Check if row count matches
      if (itemsData.length !== templateItems.length) {
        if (!confirm(`Attention: L'offre contient ${itemsData.length} lignes alors que le modèle en contient ${templateItems.length}. Voulez-vous continuer quand même ?`)) {
          return;
        }
      }

      // Enhanced Mapping and Verification
      const bidItems: BidderItem[] = templateItems.map((templateItem) => {
        // Find matching item in extracted data by reference
        const extractedItem = itemsData.find((item: any) => item.itemReference === templateItem.itemReference);
        
        const bidQuantity = extractedItem ? (Number(extractedItem.quantity) || 0) : 0;
        const unitPrice = extractedItem ? (Number(extractedItem.unitPrice) || 0) : 0;
        const announcedTotal = extractedItem ? (Number(extractedItem.total) || 0) : 0;
        
        // Correct calculation always uses reference quantity and truncation to 2 decimal places
        const calcTotal = truncateTo2Decimals(templateItem.quantity * unitPrice);
        
        const isQuantityMismatch = Math.abs(templateItem.quantity - bidQuantity) > 0.001;
        const hasArithmeticError = Math.abs(calcTotal - announcedTotal) > 0.05;
        
        let msg = "";
        if (!extractedItem) msg = "Article manquant dans l'offre";
        else if (isQuantityMismatch) msg = `Quantité modifiée (${bidQuantity} -> ${templateItem.quantity})`;
        else if (hasArithmeticError) msg = "Erreur de calcul (multiplication/report)";

        // Item-level comparison with reference price if available
        let itemStatus: 'Normal' | 'Abnormal' | 'Excessive' | undefined;
        if (templateItem.referenceUnitPrice && unitPrice > 0) {
          const ref = templateItem.referenceUnitPrice;
          if (unitPrice > ref * 1.2) {
            itemStatus = 'Excessive';
          } else if (unitPrice < ref * 0.75) {
            itemStatus = 'Abnormal';
          } else {
            itemStatus = 'Normal';
          }
        }

        return {
          ...templateItem,
          unitPrice,
          total: announcedTotal,
          calculatedTotal: calcTotal,
          isCorrected: isQuantityMismatch || hasArithmeticError || !extractedItem,
          
          // Verification detailed fields
          originalQuantity: bidQuantity,
          isQuantityCorrect: !isQuantityMismatch,
          originalTotal: announcedTotal,
          hasArithmeticError: hasArithmeticError,
          discrepancyMessage: msg,
          itemStatus
        };
      });

      const totalCorrected = truncateTo2Decimals(bidItems.reduce((sum, item) => sum + item.calculatedTotal, 0));
      const originalTotal = truncateTo2Decimals(bidItems.reduce((sum, item) => sum + item.total, 0));
      const tvaAmount = truncateTo2Decimals(totalCorrected * (metadata.tvaRate / 100));
      const ttcAmount = truncateTo2Decimals(totalCorrected + tvaAmount);

      const newBidder: Bidder = {
        id: slotId,
        companyName: finalName,
        items: bidItems,
        totalAmount: originalTotal,
        correctedTotalAmount: totalCorrected,
        tvaAmount: tvaAmount,
        ttcAmount: ttcAmount,
        isExcessive: totalCorrected > metadata.estimation * 1.2,
        isAbnormallyLow: false,
        isExcluded: totalCorrected > metadata.estimation * 1.2
      };

      const updatedBidders = bidders.filter(b => b.id !== slotId);
      const recalculatedBidders = calculateAbnormalFlags([...updatedBidders, newBidder], metadata);
      setBidders(recalculatedBidders);
      (e.target as any).value = null;

    } catch (err: any) {
      console.error(err);
      const msg = err.message || JSON.stringify(err);
      if (msg.includes("Clé API Gemini manquante")) {
        alert(msg);
      } else if (msg.includes("429") || msg.includes("QUOTA_EXCEEDED") || msg.includes("RESOURCE_EXHAUSTED")) {
        alert("Limite de quota atteinte (Erreur 429). Veuillez patienter une minute avant de réessayer.");
      } else {
        alert(`Erreur d'extraction: ${msg}\n\nVeuillez vérifier la validité de votre clé API Gemini ou le format du PDF.`);
      }
    } finally {
      setExtractingBidId(null);
    }
  };

  const calculateAbnormalFlags = (list: Bidder[], meta: TenderMetadata) => {
    // Works: -20%, Supplies/Services: -25%
    const threshold = (meta.type === 'Travaux') ? 0.80 : 0.75;
    return list.map(b => {
      const isExcessive = b.ttcAmount > meta.estimation * 1.2;
      return {
        ...b,
        isAbnormallyLow: b.ttcAmount < meta.estimation * threshold,
        isExcessive: isExcessive,
        isExcluded: isExcessive
      };
    });
  };

  const exportBidderExcel = async (bidder: Bidder) => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Rapport de Vérification');

    // Title and Header metadata
    worksheet.mergeCells('A1:L1');
    const titleCell = worksheet.getCell('A1');
    titleCell.value = `${directorate.nameFr.toUpperCase()} - ${directorate.nameAr}`;
    titleCell.font = { name: 'Arial', bold: true, size: 13, color: { argb: 'FF1E3A5F' } };
    titleCell.alignment = { vertical: 'middle', horizontal: 'center' };

    worksheet.mergeCells('A2:L2');
    const subTitleCell = worksheet.getCell('A2');
    subTitleCell.value = "ROYAUME DU MAROC - MINISTÈRE DE LA JUSTICE | COMMISSION D'OUVERTURE DES PLIS";
    subTitleCell.font = { name: 'Arial', bold: true, size: 9, color: { argb: 'FF666666' } };
    subTitleCell.alignment = { vertical: 'middle', horizontal: 'center' };

    worksheet.mergeCells('A3:L3');
    const reportCell = worksheet.getCell('A3');
    reportCell.value = "BILAN DE L'EXAMEN STRUCTUREL ET ARITHMÉTIQUE DES OFFRES FINANCIÈRES";
    reportCell.font = { name: 'Arial', bold: true, size: 11 };
    reportCell.alignment = { vertical: 'middle', horizontal: 'center' };

    worksheet.addRow([]);
    worksheet.addRow(["N° d'Appel d'Offres:", metadata.tenderNumber]);
    worksheet.addRow(["Direction:", `${directorate.nameFr} (${directorate.nameAr})`]);
    worksheet.addRow(["Concurrent:", bidder.companyName]);
    worksheet.addRow(["Date de Vérification:", new Date().toLocaleDateString('fr-FR')]);
    worksheet.addRow([]);

    // Table Headers
    const tableHeader = ["Réf", "Désignation", "Unité", "Qté (Réf)", "Qté (Offre)", "Statut Qté", "P.U (Réf/MO)", "P.U (Offre)", "Statut P.U", "Total Annoncé", "Total Corrigé (Ref * PU)", "Observations/Corrections"];
    const headerRow = worksheet.addRow(tableHeader);
    headerRow.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
      cell.font = { bold: true };
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });

    // Data Rows
    bidder.items.forEach(item => {
      const rowData = [
        item.itemReference,
        item.designation,
        item.unit,
        item.quantity,
        item.originalQuantity,
        item.isQuantityCorrect ? "CONFORME" : "NON CONFORME",
        item.referenceUnitPrice || "N/A",
        item.unitPrice,
        item.itemStatus || "N/A",
        item.total,
        item.calculatedTotal,
        item.discrepancyMessage || "RAS"
      ];

      const row = worksheet.addRow(rowData);

      // Check for errors and highlight
      if (!item.isQuantityCorrect) {
        row.getCell(6).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFCCCC' } }; // Light red
        row.getCell(6).font = { color: { argb: 'FFFF0000' }, bold: true };
      }
      if (item.itemStatus === 'Abnormal' || item.itemStatus === 'Excessive') {
        row.getCell(9).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFCCCC' } };
        row.getCell(9).font = { color: { argb: 'FFFF0000' }, bold: true };
      }
      if (item.hasArithmeticError || !item.isQuantityCorrect || item.isCorrected) {
        row.getCell(12).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFCCCC' } };
        row.getCell(12).font = { color: { argb: 'FFFF0000' }, bold: true };
      }
      
      row.eachCell((cell) => {
        cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
      });
    });

    worksheet.addRow([]);

    // Footer - Totals
    const footerData = [
      ["TOTAL HT (HORS TAXES)", "", "", "", "", "", "", "", "", bidder.correctedTotalAmount],
      [`TVA (${metadata.tvaRate}%)`, "", "", "", "", "", "", "", "", bidder.tvaAmount],
      ["TOTAL TTC (TOUTES TAXES COMPRISES)", "", "", "", "", "", "", "", "", bidder.ttcAmount],
      ["TOTAL ANNONCÉ (LU)", "", "", "", "", "", "", "", "", bidder.totalAmount],
      ["ÉCART DE CALCUL (Correction)", "", "", "", "", "", "", "", "", truncateTo2Decimals(bidder.correctedTotalAmount - bidder.totalAmount)],
      ["PRIX DE RÉFÉRENCE", "", "", "", "", "", "", "", "", referencePrice],
      ["ÉCART / PRIX DE RÉFÉRENCE (%)", "", "", "", "", "", "", "", "", truncateTo2Decimals((bidder.ttcAmount - referencePrice) / referencePrice * 100).toFixed(2) + "%"],
    ];

    footerData.forEach((f) => {
      const row = worksheet.addRow(f);
      row.getCell(1).font = { bold: true };
      row.getCell(10).font = { bold: true };
    });

    worksheet.addRow([]);
    worksheet.addRow(["ANALYSE FINANCIÈRE"]).font = { bold: true, size: 12 };
    worksheet.addRow(["Estimation de l'Administration:", metadata.estimation]);
    worksheet.addRow(["Prix de Référence (Moyenne + Estimation / 2):", truncateTo2Decimals(referencePrice)]);
    worksheet.addRow(["Statut Arithmétique:", bidder.items.some(i => i.isCorrected) ? "CORRIGÉ AVEC ERREURS" : "PRÉCISION TOTALE"]);
    worksheet.addRow(["Statut Économique:", bidder.isExcluded ? "OFFRE EXCESSIVE (ÉCARTÉE)" : (bidder.isAbnormallyLow ? "OFFRE ANORMALEMENT BASSE (JUSTIFICATIFS REQUIS)" : "OFFRE ACCEPTABLE")]);
    
    if (bidder.justification) {
      worksheet.addRow(["Justification / Observations:", bidder.justification]);
    }

    // Column Widths
    worksheet.columns = [
      { width: 10 }, // A
      { width: 45 }, // B
      { width: 10 }, // C
      { width: 12 }, // D
      { width: 12 }, // E
      { width: 18 }, // F
      { width: 15 }, // G
      { width: 15 }, // H
      { width: 15 }, // I
      { width: 18 }, // J
      { width: 18 }, // K
      { width: 35 }  // L
    ];

    // Generate blob and download
    const buffer = await workbook.xlsx.writeBuffer();
    const safeAO = metadata.tenderNumber.replace(/[/\\?%*:|"<>]/g, '-');
    const safeName = bidder.companyName.replace(/[/\\?%*:|"<>]/g, '-');
    saveAs(new Blob([buffer]), `${safeAO}_${safeName}_RAPPORT_VERIFICATION.xlsx`);
  };

  const removeBidder = (id: string) => {
    setBidders(prev => calculateAbnormalFlags(prev.filter(b => b.id !== id), metadata));
    setBidderNames(prev => {
      const next = {...prev};
      delete next[id];
      return next;
    });
  };

  const updateBidderName = (id: string, newName: string) => {
    setBidderNames(prev => ({ ...prev, [id]: newName }));
    setBidders(prev => prev.map(b => b.id === id ? { ...b, companyName: newName } : b));
  };

  const updateBidderJustification = (id: string, justification: string) => {
    setBidders(prev => prev.map(b => b.id === id ? { ...b, justification } : b));
  };

  const toggleManualExclusion = (id: string) => {
    setBidders(prev => prev.map(b => b.id === id ? { ...b, isManuallyExcluded: !b.isManuallyExcluded } : b));
  };

  const { referencePrice } = useMemo(() => {
    const validBidders = bidders.filter(b => {
      const threshold = (metadata.type === 'Travaux') ? 0.80 : 0.75;
      const isAutoExcluded = b.ttcAmount > metadata.estimation * 1.2 || b.ttcAmount < metadata.estimation * threshold;
      return !isAutoExcluded && !b.isManuallyExcluded;
    });
    
    let refPrice = metadata.estimation;
    if (validBidders.length > 0) {
      const average = validBidders.reduce((sum, b) => sum + b.ttcAmount, 0) / validBidders.length;
      refPrice = truncateTo2Decimals((average + metadata.estimation) / 2);
    }

    return { referencePrice: refPrice };
  }, [bidders, metadata]);

  const bidderSlots = Array.from({ length: Math.max(1, metadata.numBidders || 0) }, (_, i) => `slot-${i}`);

  return (
    <div className="min-h-screen bg-official-bg text-slate-800 font-sans">
      <header className="bg-official-blue text-white py-4 px-8 border-b-4 border-slate-900 sticky top-0 z-50 shadow-lg">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="bg-white p-2 border-2 border-slate-900 rounded-lg shadow-sm">
              <Calculator className="w-6 h-6 text-official-blue" />
            </div>
            <div>
              <h1 className="text-lg md:text-xl font-black uppercase tracking-tight leading-none text-white">{directorate.nameFr}</h1>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[11px] font-bold text-white/90 leading-tight font-arabic" dir="rtl">{directorate.nameAr}</span>
                <span className="text-[8px] opacity-40">•</span>
                <span className="text-[9px] font-semibold uppercase tracking-widest text-white/60">Vérification des Offres</span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-3 md:gap-4">
            {view === 'editor' && (
              <button 
                onClick={() => setView('dashboard')}
                className="flex items-center gap-2 text-[10px] font-bold border-2 border-white/20 px-3 py-1.5 hover:bg-white hover:text-official-blue transition-all uppercase tracking-widest rounded shadow-sm"
              >
                <LayoutDashboard className="w-3 h-3" /> Dashboard
              </button>
            )}
            <button 
              onClick={createNewProject}
              className="text-[10px] font-bold border-2 border-white px-3 py-1.5 bg-white text-official-blue hover:bg-official-blue hover:text-white transition-all uppercase tracking-widest rounded"
            >
              Nouveau Projet
            </button>

            {/* Download Windows Desktop Software (Hidden inside installed Electron app) */}
            {!isElectron && (
              <a
                href="/download-setup"
                download="FinAudit_Justice_Setup.exe"
                onClick={() => {
                  setToastMessage("جاري تحميل ملف تثبيت البرنامج (FinAudit_Justice_Setup.exe)...");
                  setTimeout(() => setToastMessage(null), 6000);
                }}
                className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-[#004d32] hover:bg-[#003824] text-white rounded-lg font-bold text-xs shadow-md hover:shadow-lg border border-emerald-600/50 transition-all active:scale-95 select-none"
                title="تحميل ملف تثبيت البرنامج بصيغة EXE لنظام Windows"
              >
                <span className="font-arabic font-bold text-[12px] text-white leading-none">تحميل البرنامج (EXE)</span>
                <Download className="w-4 h-4 text-[#eab308] stroke-[2.5]" />
              </a>
            )}

            {/* Directorate Settings Button with symbol (...) */}
            <button 
              onClick={openDirectorateSettings}
              className="h-8 px-2.5 border-2 border-white/30 rounded-lg hover:bg-white/20 hover:border-white transition-all text-white font-mono font-black text-sm flex items-center justify-center gap-1 shadow-sm active:scale-95 group"
              title="إعدادات اسم المديرية (...) / Paramètres de la Direction"
              aria-label="إعدادات اسم المديرية"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>

            <button 
              onClick={() => setShowSettings(true)}
              className="p-1.5 border-2 border-white/20 rounded-lg hover:bg-white/10 transition-all text-white"
              title="Paramètres API"
            >
              <Settings className="w-4 h-4" />
            </button>
            <div className="text-right border-l border-white/20 pl-4 md:pl-6">
              <div className="text-sm font-mono font-bold">{new Date().toLocaleDateString('fr-FR')}</div>
              {view === 'editor' && metadata.tenderNumber && <div className="bg-white/10 text-white px-2 py-0.5 text-[9px] font-mono mt-1 border border-white/10 rounded">AO N° {metadata.tenderNumber}</div>}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-8">
        <AnimatePresence mode="wait">
          {view === 'dashboard' ? (
            <motion.div 
              key="dashboard"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <div className="flex flex-col items-center border-b border-slate-200 pb-10 text-center">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">المملكة المغربية • وزارة العدل</span>
                </div>
                <h2 className="text-4xl md:text-5xl font-black uppercase tracking-tight text-official-blue mb-2 font-arabic" dir="rtl">
                  {directorate.nameAr}
                </h2>
                <div className="flex flex-col gap-1 items-center">
                  <p className="text-sm font-bold uppercase tracking-[0.3em] text-official-blue/80 font-mono">{directorate.nameFr}</p>
                  <p className="text-xs font-bold uppercase tracking-[0.5em] text-slate-400 mt-1">فتح الأظرفة : التحقق من حسابات العروض</p>
                </div>
                <div className="mt-8 flex gap-4 items-center">
                   <div className="bg-white border border-slate-200 px-6 py-3 shadow-official rounded-full flex items-center gap-3">
                    <History className="w-4 h-4 text-official-blue" />
                    <span className="text-xs font-bold uppercase tracking-widest text-slate-600">{projects.length} Projets au total</span>
                   </div>
                   <button 
                     onClick={exportDatabase}
                     className="bg-white border border-slate-200 px-6 py-3 shadow-official rounded-full flex items-center gap-3 hover:bg-slate-50 transition-all"
                     title="Exporter la base de données"
                   >
                    <DownloadCloud className="w-4 h-4 text-emerald-600" />
                    <span className="text-xs font-bold uppercase tracking-widest text-slate-600">Exporter Data</span>
                   </button>
                   <button 
                     onClick={importDatabase}
                     className="bg-white border border-slate-200 px-6 py-3 shadow-official rounded-full flex items-center gap-3 hover:bg-slate-50 transition-all"
                     title="Importer une base de données"
                   >
                    <UploadCloud className="w-4 h-4 text-amber-600" />
                    <span className="text-xs font-bold uppercase tracking-widest text-slate-600">Importer Data</span>
                   </button>
                </div>
              </div>

              {/* Filters Section */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-white p-6 rounded-xl border border-slate-200 shadow-official">
                <div className="relative col-span-1 md:col-span-2">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-4">
                    <Calculator className="w-4 h-4 text-slate-300" />
                  </span>
                  <input
                    type="text"
                    placeholder="Rechercher par N° d'AO ou Entreprise..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-official-blue/10 focus:border-official-blue outline-none transition-all font-medium text-sm"
                  />
                </div>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-4">
                    <Clock className="w-4 h-4 text-slate-300" />
                  </span>
                  <input
                    type="date"
                    value={dateFilter}
                    onChange={(e) => setDateFilter(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-official-blue/10 focus:border-official-blue outline-none transition-all font-medium text-sm"
                  />
                </div>
              </div>

              {projects.length === 0 ? (
                <div className="official-card border-dashed p-32 flex flex-col items-center justify-center text-center">
                  <FileText className="w-20 h-20 text-slate-200 mb-6" strokeWidth={1} />
                  <h3 className="text-xl font-bold uppercase tracking-tight mb-2 text-slate-400">Aucun projet enregistré</h3>
                  <button 
                    onClick={createNewProject}
                    className="mt-6 bg-official-blue text-white px-10 py-4 font-bold uppercase tracking-widest text-[10px] rounded-lg shadow-lg hover:bg-official-blue/90 transition-all"
                  >
                    Créer mon premier projet
                  </button>
                </div>
              ) : (
                <div className="official-card overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 text-slate-400 text-[10px] font-bold uppercase tracking-[0.2em] border-b border-slate-200">
                        <th className="p-5">N° d'Appel d'Offres</th>
                        <th className="p-5">Objet / Nature</th>
                        <th className="p-5 text-right">Estimation (MAD)</th>
                        <th className="p-5 text-center">Concurrents</th>
                        <th className="p-5">Dernière Modification</th>
                        <th className="p-5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(searchQuery || dateFilter ? filteredProjects : projects).map(project => (
                        <tr 
                          key={project.id}
                          onClick={() => loadProject(project)}
                          className="group hover:bg-slate-50/80 cursor-pointer transition-colors"
                        >
                          <td className="p-5">
                            <div className="flex items-center gap-4">
                              <div className="w-10 h-10 bg-slate-100 flex items-center justify-center rounded-lg border border-slate-200 group-hover:bg-official-blue group-hover:border-official-blue group-hover:text-white transition-all">
                                <Gavel className="w-4 h-4" />
                              </div>
                              <span className="font-bold text-sm text-official-blue">
                                {project.metadata.tenderNumber || 'NON DÉFINI'}
                              </span>
                            </div>
                          </td>
                          <td className="p-5">
                            <span className="text-[10px] font-bold uppercase tracking-widest bg-slate-100 text-slate-600 px-3 py-1 rounded-full">
                              {project.metadata.type}
                            </span>
                          </td>
                          <td className="p-5 text-right font-mono font-bold text-official-blue">
                            {formatAmount(project.metadata.estimation)}
                          </td>
                          <td className="p-5 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <span className="text-xs font-bold font-mono text-official-blue">
                                {project.bidders.length}
                              </span>
                              <span className="text-[10px] text-slate-300 font-bold">/ {project.metadata.numBidders}</span>
                            </div>
                          </td>
                          <td className="p-5">
                            <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-tight">
                              <Clock className="w-3 h-3" />
                              {new Date(project.updatedAt).toLocaleDateString('fr-FR')}
                            </div>
                          </td>
                          <td className="p-5 text-right">
                            <div className="flex justify-end gap-3">
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteProject(project.id);
                                }}
                                className="p-2 text-slate-300 hover:text-official-red hover:bg-official-red/10 rounded-md transition-all"
                                title="Supprimer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                              <div className="p-2 text-slate-300 group-hover:text-official-blue transition-colors">
                                <ArrowRight className="w-4 h-4" />
                              </div>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  
                  {(searchQuery || dateFilter) && filteredProjects.length === 0 && (
                    <div className="py-20 text-center opacity-30 select-none bg-white border-t-2 border-slate-100">
                      <AlertTriangle className="w-12 h-12 mx-auto mb-4" />
                      <p className="text-sm font-black uppercase tracking-widest">Aucun résultat correspondant à votre recherche</p>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          ) : (
            <div className="space-y-8">
              {step === 1 && (
            <motion.div 
              key="step1"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              {/* Top Config Row */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Tender Meta */}
                <div className="lg:col-span-4 official-card p-8 h-fit">
                  <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
                    <span className="text-[10px] font-bold text-official-blue uppercase font-mono">{directorate.nameFr}</span>
                    <span className="text-[11px] font-bold text-slate-700 font-arabic" dir="rtl">{directorate.nameAr}</span>
                  </div>
                  <h2 className="text-xs font-bold uppercase tracking-widest mb-8 text-slate-400 flex items-center gap-2">
                    <LayoutDashboard className="w-3 h-3" /> Configuration du Marché
                  </h2>
                  <div className="space-y-8">
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block mb-2">N° d'Appel d'Offres</label>
                      <input 
                        type="text" 
                        value={metadata.tenderNumber}
                        onChange={e => setMetadata({...metadata, tenderNumber: e.target.value})}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 font-bold text-official-blue focus:ring-2 focus:ring-official-blue/10 focus:border-official-blue outline-none transition-all"
                        placeholder="Ex: 45/2024/DRJM"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-6">
                      <div>
                        <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block mb-2">Type</label>
                        <select 
                          value={metadata.type}
                          onChange={e => setMetadata({...metadata, type: e.target.value as TenderType})}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 font-bold text-official-blue focus:ring-2 focus:ring-official-blue/10 focus:border-official-blue outline-none transition-all"
                        >
                          <option value="Travaux">Travaux</option>
                          <option value="Fournitures">Fournitures</option>
                          <option value="Services">Services</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block mb-2">Concurrents</label>
                        <input 
                          type="number" 
                          min="1"
                          value={metadata.numBidders || ''}
                          onChange={e => setMetadata({...metadata, numBidders: Number(e.target.value)})}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 font-bold text-official-blue focus:ring-2 focus:ring-official-blue/10 focus:border-official-blue outline-none transition-all font-mono"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-6">
                      <div>
                        <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block mb-2">Taux TVA (%)</label>
                        <input 
                          type="number" 
                          value={metadata.tvaRate}
                          onChange={e => setMetadata({...metadata, tvaRate: Number(e.target.value)})}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 font-bold text-official-blue focus:ring-2 focus:ring-official-blue/10 focus:border-official-blue outline-none transition-all font-mono"
                        />
                      </div>
                      {metadata.type === 'Services' && (
                        <div className="flex flex-col justify-end pb-1.5">
                          <label className="flex items-center gap-3 cursor-pointer group">
                             <input 
                                type="checkbox" 
                                checked={metadata.isSpecialService}
                                onChange={e => setMetadata({...metadata, isSpecialService: e.target.checked})}
                                className="w-5 h-5 border-2 border-slate-200 rounded focus:ring-2 focus:ring-official-blue/20 checked:bg-official-blue checked:border-official-blue transition-all"
                              />
                            <span className="text-[9px] font-bold uppercase tracking-tight text-slate-600 group-hover:text-official-blue transition-colors">
                              مناولة / حراسة / نظافة
                            </span>
                          </label>
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block mb-2">Estimation du MO (MAD)</label>
                      <div className="relative">
                        <input 
                          type="number" 
                          value={metadata.estimation || ''}
                          onChange={e => setMetadata({...metadata, estimation: Number(e.target.value)})}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg p-4 font-black text-2xl text-official-blue tracking-tighter focus:ring-2 focus:ring-official-blue/10 focus:border-official-blue outline-none transition-all font-mono pr-12"
                          placeholder="0.00"
                        />
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 font-bold text-sm">MAD</div>
                      </div>
                    </div>
                    
                    {!currentProjectId && metadata.tenderNumber && (metadata.estimation || 0) > 0 && (
                      <button 
                         onClick={saveCurrentProject}
                         className="w-full bg-official-blue text-white py-4 rounded-xl font-bold uppercase tracking-widest text-[10px] shadow-lg hover:bg-official-blue/90 transition-all flex items-center justify-center gap-3"
                      >
                         Enregistrer la الصفقة 
                         <CheckCircle2 className="w-4 h-4" />
                      </button>
                    )}

                    {(metadata.estimation || 0) > 0 && (
                      <div className="mt-8 pt-8 border-t border-slate-100 space-y-4">
                        <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">عتبات التحليل المالي</h4>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="bg-official-red/5 p-4 rounded-xl border border-official-red/10">
                            <p className="text-[8px] font-bold text-official-red uppercase tracking-widest mb-1.5 opacity-70">العرض المفرط (+20%)</p>
                            <p className="text-sm font-bold font-mono text-official-red leading-tight">
                              {formatAmount((metadata.estimation || 0) * 1.2)} <span className="text-[10px] font-normal">MAD</span>
                            </p>
                          </div>
                          <div className="bg-amber-50 p-4 rounded-xl border border-amber-100">
                            <p className="text-[8px] font-bold text-amber-600 uppercase tracking-widest mb-1.5 opacity-70">العرض المنخفض جداً</p>
                            <p className="text-sm font-bold font-mono text-amber-900 leading-tight">
                              {formatAmount((metadata.estimation || 0) * (metadata.type === 'Travaux' ? 0.80 : 0.75))} <span className="text-[10px] font-normal">MAD</span>
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Main Action Area */}
                <div className="lg:col-span-8 space-y-8">
                  {/* Template Segment */}
                  <div className="official-card p-10 flex items-center justify-between gap-10 border-l-8 border-official-blue">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="bg-official-blue/10 p-2 rounded-lg">
                          <FileText className="w-6 h-6 text-official-blue" />
                        </div>
                        <h3 className="text-xl font-bold uppercase tracking-tight text-official-blue">Modèle de Référence</h3>
                      </div>
                      <p className="text-xs font-medium text-slate-500 max-w-lg leading-relaxed">
                        Chargez le bordereau vierge (CPS/DCE) pour l'audit de structure et l'extraction automatique des articles de référence.
                      </p>
                      
                      {templateItems.length > 0 && (
                        <div className="mt-6 flex items-center gap-4">
                           <div className="flex items-center gap-2 text-official-green bg-official-green/10 px-4 py-2 rounded-lg border border-official-green/10">
                            <CheckCircle2 className="w-4 h-4" />
                            <span className="text-[10px] font-bold uppercase tracking-wider">{templateItems.length} articles identifiés</span>
                          </div>
                          <button onClick={() => setTemplateItems([])} className="text-[10px] text-official-red hover:underline font-bold uppercase tracking-widest transition-all">Réinitialiser</button>
                        </div>
                      )}
                    </div>

                    <label className={cn(
                      "cursor-pointer border-2 border-dashed border-slate-200 bg-slate-50 p-8 rounded-2xl transition-all hover:bg-white hover:border-official-blue group flex flex-col items-center gap-3 min-w-[240px] shadow-sm",
                      isExtractingTemplate && "opacity-50 cursor-not-allowed"
                    )}>
                      <div className="bg-white p-3 rounded-xl shadow-sm border border-slate-100 group-hover:bg-official-blue group-hover:border-official-blue transition-all">
                        <Upload className="w-8 h-8 text-slate-400 group-hover:text-white transition-colors" />
                      </div>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 group-hover:text-official-blue">
                        {isExtractingTemplate ? "Analyse PDF..." : "Charger Modèle"}
                      </span>
                      <input type="file" onChange={handleTemplateUpload} className="hidden" accept=".pdf" disabled={isExtractingTemplate} />
                    </label>
                  </div>

                  {/* Bidders Segment */}
                  <div className="space-y-6">
                    <div className="flex justify-between items-center bg-official-blue text-white p-6 rounded-xl shadow-lg border-b-4 border-slate-900">
                      <div className="flex items-center gap-3">
                        <Users className="w-5 h-5 opacity-70" />
                        <h3 className="text-xs font-bold uppercase tracking-[0.2em]">Offres Financières ({bidders.length}/{metadata.numBidders})</h3>
                      </div>
                      {bidders.length >= (metadata.numBidders || 0) && bidders.length > 0 && (
                        <button 
                          onClick={() => setStep(3)}
                          className="bg-white text-official-blue px-8 py-2.5 text-[10px] font-bold uppercase tracking-widest hover:bg-slate-50 transition-all shadow-sm rounded flex items-center gap-2"
                        >
                          Générer l'Audit <ArrowRight className="w-3 h-3" />
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {bidderSlots.map((slotId, index) => {
                        const bidder = bidders.find(b => b.id === slotId);
                        const isExtracting = extractingBidId === slotId;
                        
                        return (
                          <div key={slotId} className={cn(
                            "official-card p-8 transition-all relative overflow-hidden group",
                            bidder ? "border-official-blue" : "border-slate-200 border-dashed bg-slate-50/50"
                          )}>
                            <div className="flex justify-between items-start mb-6">
                              <div className="flex items-center gap-2">
                                <span className="bg-slate-100 text-slate-400 text-[10px] px-2 py-1 rounded font-bold uppercase"># {index + 1}</span>
                                {bidder && (
                                   <div className="flex gap-2">
                                    {bidder.isExcluded && <span className="bg-official-red text-white text-[8px] px-2 py-0.5 rounded font-bold uppercase tracking-wider">Écarté (Excessive)</span>}
                                    {bidder.isAbnormallyLow && <span className="bg-amber-500 text-white text-[8px] px-2 py-0.5 rounded font-bold uppercase tracking-wider">Anormale (Bas)</span>}
                                    {!bidder.isExcluded && !bidder.isAbnormallyLow && (
                                      bidder.isManuallyExcluded ? (
                                        <span className="bg-slate-500 text-white text-[8px] px-2 py-0.5 rounded font-bold uppercase tracking-wider">Écarté (Manuel)</span>
                                      ) : (
                                        <span className="bg-official-green text-white text-[8px] px-2 py-0.5 rounded font-bold uppercase tracking-wider">Acceptable</span>
                                      )
                                    )}
                                  </div>
                                )}
                              </div>
                              {bidder && (
                                <button onClick={() => removeBidder(slotId)} className="text-slate-300 hover:text-official-red transition-colors p-1 hover:bg-official-red/10 rounded">
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>

                            {bidder ? (
                              <div className="animate-in fade-in slide-in-from-bottom-2">
                                <div className="relative mb-2">
                                  <input 
                                    type="text"
                                    value={bidder.companyName}
                                    onChange={(e) => updateBidderName(slotId, e.target.value)}
                                    className="text-xl font-bold uppercase truncate w-full bg-transparent border-b-2 border-transparent focus:border-official-blue/20 focus:outline-none text-official-blue"
                                    placeholder="Nom du concurrent..."
                                  />
                                </div>
                                <div className="grid grid-cols-2 gap-4 mb-3">
                                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                                    <p className="text-[8px] font-bold text-slate-400 uppercase mb-1">Total TTC Corrigé</p>
                                    <p className={cn(
                                      "text-lg font-bold font-mono leading-none",
                                      bidder.isExcluded ? "text-official-red" : "text-official-blue"
                                    )}>
                                      {formatAmount(bidder.ttcAmount)} <span className="text-[10px] font-normal">MAD</span>
                                    </p>
                                  </div>
                                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                                    <p className="text-[8px] font-bold text-slate-400 uppercase mb-1">Articles Audités</p>
                                    <p className="text-lg font-bold font-mono text-slate-600 leading-none">
                                      {bidder.items.length} <span className="text-[10px] font-normal">Lignes</span>
                                    </p>
                                  </div>
                                </div>

                                {!(bidder.isExcluded || bidder.isAbnormallyLow) ? (
                                  <div className="mb-4 p-2.5 bg-slate-50 border border-slate-100 rounded-lg flex items-center gap-2">
                                    <input 
                                      type="checkbox"
                                      id={`card-exclude-${bidder.id}`}
                                      checked={!bidder.isManuallyExcluded}
                                      onChange={() => toggleManualExclusion(bidder.id)}
                                      className="w-3.5 h-3.5 text-official-blue border-slate-300 rounded cursor-pointer"
                                    />
                                    <label htmlFor={`card-exclude-${bidder.id}`} className="text-[10px] font-bold text-slate-600 uppercase tracking-tight cursor-pointer select-none flex-1">
                                      {bidder.isManuallyExcluded ? "Exclu manuellement (Cliquer pour inclure)" : "Inclure dans le prix de référence"}
                                    </label>
                                  </div>
                                ) : (
                                  <div className="mb-4 p-2.5 bg-rose-50 border border-rose-100/50 rounded-lg text-rose-700 text-[10px] font-bold uppercase tracking-tight">
                                    Exclus d'office d'après la formule d'écart
                                  </div>
                                )}

                                <div className="flex items-center justify-between pt-4 border-t border-slate-50">
                                  <div className="flex gap-4 text-[9px] font-bold text-slate-400 uppercase">
                                     <span>HT: {formatAmount(bidder.correctedTotalAmount)}</span>
                                     <span>TVA: {formatAmount(bidder.tvaAmount)}</span>
                                  </div>
                                  <button 
                                    onClick={() => setBidderNames({...bidderNames, [slotId]: bidder.companyName})}
                                    className="text-[9px] font-bold text-official-blue uppercase hover:underline"
                                  >
                                    Actualiser
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className={cn(
                                "space-y-6",
                                !currentProjectId && "opacity-20 pointer-events-none"
                              )}>
                                {!currentProjectId && (
                                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm p-8 text-center">
                                    <AlertTriangle className="w-8 h-8 text-amber-500 mb-3" />
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600 max-w-[180px]">
                                      Enregistrez le projet pour activer l'importation
                                    </p>
                                  </div>
                                )}
                                <div>
                                  <label className="text-[9px] font-bold text-slate-400 uppercase mb-2 block">Identité du Concurrent</label>
                                  <input 
                                    type="text"
                                    placeholder="Saisir le nom de l'entreprise..."
                                    value={bidderNames[slotId] || ''}
                                    onChange={e => setBidderNames({...bidderNames, [slotId]: e.target.value})}
                                    className="w-full bg-slate-100 border border-slate-200 rounded-lg p-3 text-sm font-bold focus:ring-2 focus:ring-official-blue/10 focus:border-official-blue outline-none transition-all"
                                  />
                                </div>

                                <label className={cn(
                                  "cursor-pointer w-full border-2 border-dashed border-slate-200 bg-white py-8 rounded-2xl flex flex-col items-center gap-3 hover:bg-slate-50 hover:border-official-blue transition-all group/upload shadow-sm",
                                  (isExtracting || !currentProjectId) && "opacity-30 cursor-not-allowed"
                                )}>
                                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 group-hover:bg-official-blue transition-all">
                                    <Upload className="w-8 h-8 text-slate-300 group-hover:text-white transition-colors" />
                                  </div>
                                  <div className="text-center">
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 group-hover:text-official-blue block mb-1">
                                      {isExtracting ? "Analyse en cours..." : "Importer Offre Financière"}
                                    </span>
                                    <span className="text-[8px] text-slate-300 uppercase font-medium">Format PDF / Scan</span>
                                  </div>
                                  <input 
                                    type="file" 
                                    className="hidden" 
                                    accept=".pdf" 
                                    onChange={e => handleBidUpload(slotId, e)}
                                    disabled={!!extractingBidId || !currentProjectId}
                                  />
                                </label>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div 
              key="step3"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-10"
            >
              <div className="flex justify-between items-center border-b-2 border-slate-200 pb-10">
                <div>
                   <h2 className="text-4xl font-black uppercase tracking-tighter text-official-blue mb-1">Analyse des Offres Financières</h2>
                   <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Rapport de vérification et d'audit de structure</p>
                </div>
                <div className="flex gap-4">
                  <button 
                    onClick={() => window.print()}
                    className="text-[10px] font-bold uppercase tracking-widest bg-white border-2 border-slate-200 px-6 py-3 rounded-lg hover:border-official-blue hover:text-official-blue transition-all flex items-center gap-2 shadow-sm"
                  >
                    <Download className="w-3 h-3" /> Imprimer Rapport
                  </button>
                  <button 
                    onClick={() => setView('dashboard')}
                    className="text-[10px] font-bold uppercase tracking-widest bg-official-blue text-white px-8 py-3 rounded-lg shadow-lg hover:bg-official-blue/90 transition-all"
                  >
                    Fermer l'Audit
                  </button>
                </div>
              </div>

              {/* Institutional Header Banner (Screen & Print) */}
              <div className="bg-white border-2 border-slate-200 p-6 rounded-xl shadow-sm">
                <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-center md:text-left">
                  <div className="space-y-0.5">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Royaume du Maroc • Ministère de la Justice</p>
                    <p className="text-lg font-black uppercase text-official-blue tracking-tight">{directorate.nameFr}</p>
                    <p className="text-[10px] font-mono font-bold text-slate-500">Commission d'Ouverture des Plis & d'Évaluation des Offres</p>
                  </div>
                  <div className="px-5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-center">
                    <span className="text-[11px] font-mono font-black text-official-blue uppercase block">
                      AO N° {metadata.tenderNumber || 'NON SPÉCIFIÉ'}
                    </span>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                      Type: {metadata.type} • {bidders.length} Offres
                    </span>
                  </div>
                  <div className="space-y-0.5 text-center md:text-right" dir="rtl">
                    <p className="text-[10px] font-bold text-slate-500 font-arabic">المملكة المغربية • وزارة العدل</p>
                    <p className="text-lg font-black text-official-blue font-arabic">{directorate.nameAr}</p>
                    <p className="text-[10px] font-bold text-slate-500 font-arabic">لجنة فتح الأظرفة والتحقق من حسابات العروض</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="official-card p-6 border-l-4 border-official-blue">
                  <div className="text-[10px] uppercase font-bold tracking-widest text-slate-400 mb-2">Estimation MO</div>
                  <div className="text-xl font-bold font-mono text-official-blue">{formatAmount(metadata.estimation)} <span className="text-[10px] font-normal">MAD</span></div>
                </div>
                <div className="official-card p-6 border-l-4 border-slate-400">
                  <div className="text-[10px] uppercase font-bold tracking-widest text-slate-400 mb-2">PRIX DE RÉFÉRENCE</div>
                  <div className="text-xl font-bold font-mono text-slate-900">{formatAmount(referencePrice)} <span className="text-[10px] font-normal">MAD</span></div>
                </div>
                <div className="official-card p-6 border-l-4 border-official-red">
                  <div className="text-[10px] uppercase font-bold tracking-widest text-slate-400 mb-2">SEUIL EXCESSIF (+20%)</div>
                  <div className="text-xl font-bold font-mono text-official-red">{formatAmount((metadata.estimation || 0) * 1.2)} <span className="text-[10px] font-normal">MAD</span></div>
                </div>
                <div className="official-card p-6 border-l-4 border-slate-200">
                  <div className="text-[10px] uppercase font-bold tracking-widest text-slate-400 mb-2">CONCURRENTS</div>
                  <div className="text-xl font-bold font-mono text-slate-600">{bidders.length} / {metadata.numBidders}</div>
                </div>
              </div>

              {/* Chart Visualization */}
              <div className="official-card p-10">
                 <div className="flex justify-between items-center mb-12">
                    <div>
                       <h3 className="text-lg font-bold uppercase tracking-tight text-official-blue">Analyse Comparative</h3>
                       <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Écart par rapport au prix de référence</p>
                    </div>
                    <div className="flex gap-6">
                       <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded bg-official-blue"></div>
                          <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Acceptable</span>
                       </div>
                       <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded bg-official-red"></div>
                          <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Écarté</span>
                       </div>
                    </div>
                 </div>

                 <div className="h-[350px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                       <BarChart 
                          data={bidders.map(b => ({ 
                             name: b.companyName, 
                             amount: b.ttcAmount,
                             htAmount: b.correctedTotalAmount,
                             tvaAmount: b.tvaAmount,
                             isExcluded: b.ttcAmount > metadata.estimation * 1.2 || !!b.isManuallyExcluded,
                             isManuallyExcluded: b.isManuallyExcluded,
                             isAbnormallyLow: b.isAbnormallyLow,
                             justification: b.justification
                          })).sort((a, b) => a.amount - b.amount)}
                          margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
                       >
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis 
                             dataKey="name" 
                             angle={-45} 
                             textAnchor="end" 
                             interval={0} 
                             tick={{ fontSize: 9, fontWeight: 700, fill: '#64748b' }}
                             stroke="#e2e8f0"
                          />
                          <YAxis 
                             tick={{ fontSize: 9, fontBold: true, fill: '#94a3b8' }}
                             stroke="#e2e8f0"
                             tickFormatter={(value) => `${(value / 1000).toLocaleString()}k`}
                          />
                          <Tooltip 
                             content={({ active, payload }) => {
                                if (active && payload && payload.length) {
                                   const data = payload[0].payload;
                                   return (
                                      <div className="bg-white p-4 border border-slate-200 rounded-xl shadow-xl min-w-[200px]">
                                         <p className="font-bold text-official-blue border-b border-slate-100 pb-2 mb-3 uppercase tracking-tighter text-xs">{data.name}</p>
                                         <div className="space-y-1.5">
                                           <div className="flex justify-between text-[10px]">
                                              <span className="text-slate-400 font-bold uppercase">Montant TTC</span>
                                              <span className="font-bold text-official-blue">{formatAmount(data.amount)} MAD</span>
                                           </div>
                                           <div className="flex justify-between text-[10px]">
                                              <span className="text-slate-400 font-bold uppercase">Écart / Réf</span>
                                              <span className={cn(
                                                "font-bold",
                                                ((data.amount - referencePrice) / referencePrice * 100) > 0 ? "text-official-red" : "text-official-green"
                                              )}>
                                                {formatPercent(((data.amount - referencePrice) / referencePrice) * 100)}%
                                              </span>
                                           </div>
                                           <div className="flex justify-between text-[10px]">
                                              <span className="text-slate-400 font-bold uppercase">Montant HT</span>
                                              <span className="font-bold">{formatAmount(data.htAmount)}</span>
                                           </div>
                                           <div className="flex justify-between text-[10px]">
                                              <span className="text-slate-400 font-bold uppercase">TVA</span>
                                              <span className="font-bold">{formatAmount(data.tvaAmount)}</span>
                                           </div>
                                         </div>
                                         <div className={cn(
                                           "mt-4 pt-3 border-t border-slate-100 flex items-center justify-center gap-2",
                                            data.isExcluded ? "text-official-red" : (data.isAbnormallyLow ? "text-amber-500" : "text-official-green")
                                         )}>
                                            <div className="w-2 h-2 rounded-full bg-current"></div>
                                            <span className="text-[10px] font-bold uppercase tracking-tighter">
                                               {data.isManuallyExcluded ? "OFFRE EXCLUE (MANUEL)" : data.isExcluded ? "OFFRE EXCESSIVE (ÉCARTÉE)" : (data.isAbnormallyLow ? "OFFRE ANORMALEMENT BASSE" : "OFFRE ADMISSIBLE / RETENUE")}
                                            </span>
                                         </div>
                                      </div>
                                   );
                                }
                                return null;
                             }}
                          />
                          <ReferenceLine 
                             y={metadata.estimation} 
                             stroke="#94a3b8" 
                             strokeDasharray="8 8" 
                             strokeWidth={1}
                             label={{ 
                                value: "ESTIMATION MO", 
                                position: "right", 
                                fill: "#94a3b8", 
                                fontSize: 9, 
                                fontWeight: 700 
                             }} 
                          />
                          <ReferenceLine 
                             y={referencePrice} 
                             stroke="#1E3A5F" 
                             strokeDasharray="4 4" 
                             strokeWidth={2}
                             label={{ 
                                value: "PRIX DE RÉFÉRENCE", 
                                position: "left", 
                                fill: "#1E3A5F", 
                                fontSize: 9, 
                                fontWeight: 900 
                             }} 
                          />
                          <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                             {bidders.map((entry, index) => (
                                <Cell 
                                   key={`cell-${index}`} 
                                   fill={entry.isExcluded ? '#C62828' : (entry.isAbnormallyLow ? '#F59E0B' : '#1E3A5F')} 
                                />
                             ))}
                          </Bar>
                       </BarChart>
                    </ResponsiveContainer>
                 </div>
              </div>

              <div className="official-card overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-400 border-b border-slate-200">
                      <th className="p-5 text-[10px] font-bold uppercase tracking-widest">Concurrent</th>
                      <th className="p-5 text-[10px] font-bold uppercase tracking-widest text-right">Montant Annoncé</th>
                      <th className="p-5 text-[10px] font-bold uppercase tracking-widest text-right">Montant Corrigé</th>
                      <th className="p-5 text-[10px] font-bold uppercase tracking-widest text-center">Écart (%)</th>
                      <th className="p-5 text-[10px] font-bold uppercase tracking-widest">Statut Final</th>
                      <th className="p-5 text-[10px] font-bold uppercase tracking-widest text-right">Rapports</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {bidders.slice().sort((a, b) => {
                      const getRankScore = (bidder: Bidder) => {
                        const threshold = (metadata.type === 'Travaux') ? 0.80 : 0.75;
                        const isAutoExcluded = bidder.ttcAmount > metadata.estimation * 1.2 || bidder.ttcAmount < metadata.estimation * threshold;
                        const isExcludedFinal = isAutoExcluded || bidder.isManuallyExcluded;
                        if (isExcludedFinal) {
                          return 1000000000 + Math.abs(bidder.ttcAmount - referencePrice);
                        }
                        return Math.abs(bidder.ttcAmount - referencePrice);
                      };
                      return getRankScore(a) - getRankScore(b);
                    }).map((bidder) => {
                      const diffPercent = truncateTo2Decimals(((bidder.ttcAmount - referencePrice) / referencePrice) * 100);
                      const threshold = (metadata.type === 'Travaux') ? 0.80 : 0.75;
                      const isAutoExcluded = bidder.ttcAmount > metadata.estimation * 1.2 || bidder.ttcAmount < metadata.estimation * threshold;
                      const isExcludedFinal = isAutoExcluded || bidder.isManuallyExcluded;
                      
                      return (
                        <tr key={bidder.id} className={cn(
                          "transition-colors hover:bg-slate-50/50",
                          isExcludedFinal ? "bg-slate-50/20" : ""
                        )}>
                          <td className="p-5">
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-2">
                                {!isAutoExcluded && (
                                  <input 
                                    type="checkbox"
                                    checked={!bidder.isManuallyExcluded}
                                    onChange={() => toggleManualExclusion(bidder.id)}
                                    className="w-4 h-4 text-official-blue border-slate-300 rounded cursor-pointer"
                                    title={bidder.isManuallyExcluded ? "Cliquer pour inclure" : "Cliquer pour exclure manuellement"}
                                  />
                                )}
                                <span className={cn(
                                  "font-bold uppercase text-sm",
                                  isExcludedFinal ? "text-slate-400 line-through" : "text-official-blue"
                                )}>
                                  {bidder.companyName}
                                </span>
                              </div>
                              <div className="flex flex-wrap gap-1.5 mt-1">
                                {bidder.items.some(i => !i.isQuantityCorrect) && (
                                  <span className="bg-amber-50 text-amber-600 text-[8px] px-2 py-0.5 font-bold uppercase border border-amber-100 rounded">Anomalie Quantités</span>
                                )}
                                {bidder.items.some(i => i.hasArithmeticError) && (
                                  <span className="bg-official-red/5 text-official-red text-[8px] px-2 py-0.5 font-bold uppercase border border-official-red/10 rounded">Erreur Calcul</span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="p-5 text-right font-mono text-sm text-slate-400">
                            {formatAmount(bidder.totalAmount)}
                          </td>
                          <td className="p-5 text-right">
                             <div className="flex flex-col items-end">
                               <span className="font-bold text-official-blue">{formatAmount(bidder.ttcAmount)}</span>
                               <span className="text-[9px] text-slate-400 font-bold uppercase tracking-tighter">HT: {formatAmount(bidder.correctedTotalAmount)}</span>
                             </div>
                          </td>
                          <td className={cn(
                            "p-5 text-center text-xs font-bold font-mono",
                            diffPercent > 20 ? "text-official-red" : (diffPercent < -25 ? "text-amber-500" : "text-slate-600")
                          )}>
                            {diffPercent > 0 ? '+' : ''}{formatPercent(diffPercent)}%
                          </td>
                          <td className="p-5">
                            {bidder.ttcAmount > metadata.estimation * 1.2 ? (
                              <span className="bg-official-red/10 text-official-red text-[10px] px-3 py-1.5 rounded-full font-bold uppercase border border-official-red/20 shadow-sm block text-center">Excessive (Auto)</span>
                            ) : bidder.isAbnormallyLow ? (
                              <div className="flex flex-col gap-2">
                                <span className="bg-amber-50 text-amber-600 text-[10px] px-3 py-1.5 rounded-full font-bold uppercase border border-amber-200 text-center shadow-sm block">Basse (Auto)</span>
                                <textarea
                                  placeholder="Observation..."
                                  value={bidder.justification || ''}
                                  onChange={(e) => updateBidderJustification(bidder.id, e.target.value)}
                                  className="w-full text-[9px] p-2 border border-slate-200 rounded bg-slate-50 focus:ring-2 focus:ring-amber-500/10 focus:border-amber-500 outline-none resize-none h-16 transition-all"
                                />
                              </div>
                            ) : bidder.isManuallyExcluded ? (
                              <span className="bg-slate-100 text-slate-500 text-[10px] px-3 py-1.5 rounded-full font-bold uppercase border border-slate-200 shadow-sm block text-center">Exclu (Manuel)</span>
                            ) : (
                              <span className="bg-official-green/10 text-official-green text-[10px] px-3 py-1.5 rounded-full font-bold uppercase border border-official-green/20 shadow-sm text-center block w-fit">Admise / Retenue</span>
                            )}
                          </td>
                          <td className="p-5 text-right">
                            <button 
                              onClick={() => exportBidderExcel(bidder)}
                              className="text-[10px] font-bold text-official-blue uppercase border border-slate-200 px-4 py-2 rounded-lg hover:border-official-blue transition-all flex items-center gap-2 ml-auto shadow-sm"
                            >
                              <Download className="w-3 h-3" /> Excel
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="bg-official-blue text-white p-12 rounded-3xl shadow-2xl relative overflow-hidden border-b-8 border-slate-900">
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -mr-32 -mt-32 blur-3xl"></div>
                <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-10">
                  <div className="flex-1">
                    <div className="flex items-center gap-4 mb-6">
                      <div className="bg-white/10 p-3 rounded-2xl backdrop-blur-sm">
                        <TrendingDown className="w-8 h-8 text-white" />
                      </div>
                      <h3 className="text-2xl font-black uppercase tracking-tighter">Synthèse de l'Évaluation Économique</h3>
                    </div>
                    <div className="space-y-6">
                      <p className="text-white/60 text-xs font-bold uppercase tracking-[0.3em]">Résumé de l'analyse financière :</p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 border-y border-white/10 py-6">
                        <div>
                          <p className="text-[9px] font-bold text-white/40 uppercase tracking-wider mb-1">Estimation Globale</p>
                          <p className="text-xl font-mono font-bold">{formatAmount(metadata.estimation)} MAD</p>
                        </div>
                        <div>
                          <p className="text-[9px] font-bold text-white/40 uppercase tracking-wider mb-1">Prix de Référence</p>
                          <p className="text-xl font-mono font-bold text-emerald-300">{formatAmount(referencePrice)} MAD</p>
                        </div>
                        <div>
                          <p className="text-[9px] font-bold text-white/40 uppercase tracking-wider mb-1">Candidats Candidatables</p>
                          <p className="text-xl font-mono font-bold">
                            {bidders.filter(b => {
                              const threshold = (metadata.type === 'Travaux') ? 0.8 : 0.75;
                              const isAuto = b.ttcAmount > metadata.estimation * 1.2 || b.ttcAmount < metadata.estimation * threshold;
                              return !isAuto && !b.isManuallyExcluded;
                            }).length} / {bidders.length}
                          </p>
                        </div>
                      </div>
                      <p className="text-[10px] opacity-65 font-mono uppercase leading-relaxed max-w-4xl">
                        Avis : Le classement des concurrents est établi par ordre d'écart absolu croissant par rapport au Prix de Référence ({formatAmount(referencePrice)} MAD). Les offres écartées d'office ou exclues manuellement sont repoussées en fin de rapport.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
          </motion.div>
        )}
          </div>
          )}
        </AnimatePresence>

        {/* API Settings Modal */}
        <AnimatePresence>
          {showSettings && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden max-w-lg w-full"
              >
                <div className="bg-official-blue p-6 text-white flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <Settings className="w-5 h-5" />
                    <h3 className="text-lg font-bold uppercase tracking-tight">Configuration API</h3>
                  </div>
                  <button onClick={() => setShowSettings(false)} className="hover:opacity-70">
                    <XCircle className="w-6 h-6" />
                  </button>
                </div>
                <div className="p-8 space-y-6">
                  <div className="space-y-4">
                    
                    {apiKeys.map((key, idx) => (
                      <div key={idx} className="space-y-2 pb-4 border-b border-slate-50 last:border-0 last:pb-0">
                        <div className="flex justify-between items-center text-[10px] font-bold uppercase text-slate-500">
                          <span>Clé #{idx + 1} {currentKeyIndex === idx && <span className="text-official-green ml-2">● Active</span>}</span>
                          <button 
                            onClick={async () => {
                              if (!key) { alert("Veuillez saisir la clé #" + (idx + 1)); return; }
                              try {
                                const testAi = new GoogleGenAI({ apiKey: key });
                                await (testAi as any).models.generateContent({
                                  model: "gemini-1.5-flash",
                                  contents: [{ role: 'user', parts: [{ text: "test" }] }]
                                });
                                alert(`La clé #${idx + 1} est VALIDE !`);
                              } catch (e: any) {
                                alert(`La clé #${idx + 1} est INVALIDE: ` + (e.message || "Erreur inconnue"));
                              }
                            }}
                            className="text-official-blue hover:underline"
                          >
                            Tester la clé
                          </button>
                        </div>
                        <input 
                          type="password"
                          value={key}
                          onChange={(e) => {
                            const next = [...apiKeys];
                            next[idx] = e.target.value;
                            setApiKeys(next);
                            safeStorage.setItem('gemini_api_keys', JSON.stringify(next));
                          }}
                          placeholder={`Collez la clé #${idx + 1} ici...`}
                          className="w-full bg-slate-50 border-2 border-slate-100 rounded-lg px-4 py-2.5 outline-none focus:border-official-blue transition-all font-mono text-xs"
                        />
                      </div>
                    ))}

                    <p className="text-[10px] text-slate-500 italic">
                      Les clés sont stockées localement. Le système bascule automatiquement entre elles si l'une dépasse son quota.
                    </p>
                  </div>

                  <button 
                    onClick={() => setShowSettings(false)}
                    className="w-full bg-official-blue text-white py-3 rounded-lg font-bold uppercase tracking-widest hover:bg-slate-900 transition-all text-sm shadow-lg"
                  >
                    Enregistrer et Fermer
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Directorate Settings Modal (...) */}
        <AnimatePresence>
          {showDirectorateModal && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                className="bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden max-w-lg w-full"
              >
                {/* Modal Header */}
                <div className="bg-official-blue p-6 text-white flex justify-between items-center border-b-4 border-slate-900">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-white/10 rounded-lg">
                      <Building2 className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="text-base font-black tracking-tight">إعدادات اسم المديرية الإقليمية</h3>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-white/70">Paramètres de la Direction</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setShowDirectorateModal(false)} 
                    className="p-1 rounded-lg hover:bg-white/10 transition-colors text-white/80 hover:text-white"
                    title="إغلاق"
                  >
                    <XCircle className="w-6 h-6" />
                  </button>
                </div>

                {/* Modal Form */}
                <form onSubmit={handleSaveDirectorate} className="p-6 md:p-8 space-y-6">
                  <div className="space-y-5">
                    {/* Field 1: Arabic Name */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center text-xs font-bold text-slate-700" dir="rtl">
                        <label htmlFor="dir-name-ar" className="flex items-center gap-1.5 text-official-blue">
                          <span>اسم المديرية باللغة العربية</span>
                          <span className="text-official-red">*</span>
                        </label>
                        <span className="text-[10px] text-slate-400 font-normal">
                          (الحالي: <strong className="font-bold text-slate-600">{directorate.nameAr}</strong>)
                        </span>
                      </div>
                      <input 
                        id="dir-name-ar"
                        type="text"
                        dir="rtl"
                        value={draftDirectorateAr}
                        onChange={(e) => setDraftDirectorateAr(e.target.value)}
                        placeholder="مثال: المديرية الإقليمية للعدل بالرشيدية"
                        className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-official-blue focus:bg-white transition-all text-sm font-semibold text-slate-800"
                        required
                      />
                    </div>

                    {/* Field 2: French Name */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center text-xs font-bold text-slate-700">
                        <label htmlFor="dir-name-fr" className="flex items-center gap-1.5 text-official-blue">
                          <span>Nom de la Direction en Français</span>
                          <span className="text-official-red">*</span>
                        </label>
                        <span className="text-[10px] text-slate-400 font-normal">
                          (Actuel: <strong className="font-mono font-bold text-slate-600">{directorate.nameFr}</strong>)
                        </span>
                      </div>
                      <input 
                        id="dir-name-fr"
                        type="text"
                        dir="ltr"
                        value={draftDirectorateFr}
                        onChange={(e) => setDraftDirectorateFr(e.target.value)}
                        placeholder="Ex: DP JUSTICE ERRACHIDIA"
                        className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-official-blue focus:bg-white transition-all text-sm font-mono font-bold text-slate-800 uppercase"
                        required
                      />
                    </div>
                  </div>

                  {/* Action Buttons: حفظ & إلغاء */}
                  <div className="grid grid-cols-2 gap-3 pt-3">
                    <button 
                      type="submit"
                      className="w-full bg-official-blue hover:bg-slate-900 text-white py-3 px-4 rounded-xl font-bold uppercase tracking-wider text-xs shadow-md transition-all flex items-center justify-center gap-2 hover:shadow-lg active:scale-98"
                    >
                      <Check className="w-4 h-4 text-emerald-400" />
                      <span>حفظ</span>
                    </button>
                    <button 
                      type="button"
                      onClick={() => setShowDirectorateModal(false)}
                      className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 py-3 px-4 rounded-xl font-bold uppercase tracking-wider text-xs transition-all border border-slate-200 active:scale-98"
                    >
                      <span>إلغاء</span>
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Toast Notification */}
        <AnimatePresence>
          {toastMessage && (
            <motion.div 
              initial={{ opacity: 0, y: 50, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.9 }}
              className="fixed bottom-6 right-6 z-[120] bg-slate-900 text-white px-5 py-3.5 rounded-xl shadow-2xl border border-slate-700 flex items-center gap-3"
              dir="rtl"
            >
              <div className="bg-emerald-500/20 text-emerald-400 p-1.5 rounded-lg">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div className="text-xs font-bold">{toastMessage}</div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <footer className="mt-20 border-t border-slate-200 p-12 text-center text-[10px] font-bold uppercase tracking-widest text-slate-400">
        <p className="mb-2" dir="rtl">{directorate.nameAr} ({directorate.nameFr}) _فتح الأظرفة : التحقق من حسابات العروض_</p>
        <p className="text-indigo-600">انجاز حجاجي عبدالعالي</p>
      </footer>
    </div>
  );
}
