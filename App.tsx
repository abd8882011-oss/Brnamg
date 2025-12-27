
import React, { useState, useMemo, useEffect } from 'react';
// Added ScheduleSlot to types import to fix type errors in analysis logic
import { Teacher, ClassSection, Subject, Assignment, WeeklySchedule, ScheduleSlot } from './types';
import { DAYS_OF_WEEK, ICONS } from './constants';
import scheduler from "./services/Scheduler";
import { getScheduleAdvice } from './services/geminiService';
import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

const STORAGE_KEY = 'school_scheduler_db_v1';

const App: React.FC = () => {
  // State for inputs
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [classes, setClasses] = useState<ClassSection[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [settings, setSettings] = useState({
    workingDays: [0, 1, 2, 3, 4],
    periodsPerDay: 7,
    weekendDay: 5
  });

  // Selection for "Teacher Individual View"
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>('');
  const [isTeacherViewOpen, setIsTeacherViewOpen] = useState(false);
  
  // Selection for "Off-hours" UI
  const [editingTeacherId, setEditingTeacherId] = useState<string | null>(null);

  // Form State
  const [newTeacherName, setNewTeacherName] = useState('');
  const [newClassName, setNewClassName] = useState('');
  const [newSubjectName, setNewSubjectName] = useState('');
  
  // Assignment Form State
  const [assignTeacher, setAssignTeacher] = useState('');
  const [assignSubject, setAssignSubject] = useState('');
  const [assignClass, setAssignClass] = useState('');
  const [assignHours, setAssignHours] = useState(1);

  // Output State
  const [schedule, setSchedule] = useState<WeeklySchedule | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeTab, setActiveTab] = useState<'inputs' | 'schedule' | 'settings' | 'reports' | 'backup'>('inputs');
  const [dbStatus, setDbStatus] = useState<'connected' | 'saving' | 'idle'>('connected');

  // Load Data from "Database" on Mount
  useEffect(() => {
    const savedData = localStorage.getItem(STORAGE_KEY);
    if (savedData) {
      try {
        const data = JSON.parse(savedData);
        if (data.teachers) setTeachers(data.teachers);
        if (data.classes) setClasses(data.classes);
        if (data.subjects) setSubjects(data.subjects);
        if (data.assignments) setAssignments(data.assignments);
        if (data.settings) setSettings(data.settings);
        if (data.schedule) setSchedule(data.schedule);
      } catch (err) {
        console.error("Failed to load database:", err);
      }
    }
  }, []);

  // Auto-save to "Database" whenever state changes
  useEffect(() => {
    const saveData = () => {
      setDbStatus('saving');
      const data = {
        teachers,
        classes,
        subjects,
        assignments,
        settings,
        schedule
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      setTimeout(() => setDbStatus('idle'), 500);
    };

    const timer = setTimeout(saveData, 1000); // Debounce saves
    return () => clearTimeout(timer);
  }, [teachers, classes, subjects, assignments, settings, schedule]);

  const handleExcelImportComprehensive = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const bstr = event.target?.result;
        const workbook = XLSX.read(bstr, { type: 'binary' });
        const sheet1 = workbook.Sheets[workbook.SheetNames[0]];
        const data1 = XLSX.utils.sheet_to_json(sheet1, { header: 1 }) as any[][];
        const rows1 = data1.slice(1);

        const rawTeachers = rows1.map(row => row[0]).filter(Boolean).map(String);
        const rawClasses = rows1.map(row => row[1]).filter(Boolean).map(String);
        const rawSubjects = rows1.map(row => row[2]).filter(Boolean).map(String);

        const newTeachers = [...new Set(rawTeachers)].map(n => ({ id: crypto.randomUUID(), name: n.trim() }));
        const newClasses = [...new Set(rawClasses)].map(n => ({ id: crypto.randomUUID(), name: n.trim() }));
        const newSubjects = [...new Set(rawSubjects)].map(n => ({ id: crypto.randomUUID(), name: n.trim() }));

        setTeachers(newTeachers);
        setClasses(newClasses);
        setSubjects(newSubjects);

        if (workbook.SheetNames.length > 1) {
          const sheet2 = workbook.Sheets[workbook.SheetNames[1]];
          const data2 = XLSX.utils.sheet_to_json(sheet2, { header: 1 }) as any[][];
          const rows2 = data2.slice(1);
          const newAssignments: Assignment[] = [];
          rows2.forEach(row => {
            const t = newTeachers.find(x => x.name === String(row[0] || '').trim());
            const s = newSubjects.find(x => x.name === String(row[1] || '').trim());
            const c = newClasses.find(x => x.name === String(row[2] || '').trim());
            if (t && s && c) {
              newAssignments.push({ id: crypto.randomUUID(), teacherId: t.id, subjectId: s.id, classId: c.id, hoursPerWeek: parseInt(row[3]) || 1 });
            }
          });
          setAssignments(newAssignments);
        }
        alert('تم الاستيراد بنجاح');
      } catch (err) { alert('خطأ في الملف'); }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  const handleBackup = () => {
    const data = {
      teachers,
      classes,
      subjects,
      assignments,
      settings
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `نسخة_احتياطية_البرنامج_الأسبوعي_${new Date().toLocaleDateString('ar-EG').replace(/\//g, '-')}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleRestore = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const data = JSON.parse(content);
        
        if (data.teachers && data.classes && data.subjects && data.assignments && data.settings) {
          if (window.confirm('سيتم استبدال البيانات الحالية بالنسخة الاحتياطية، هل تريد المتابعة؟')) {
            setTeachers(data.teachers);
            setClasses(data.classes);
            setSubjects(data.subjects);
            setAssignments(data.assignments);
            setSettings(data.settings);
            setSchedule(null);
            alert('تم استعادة البيانات بنجاح.');
          }
        } else {
          alert('ملف النسخة الاحتياطية غير صالح أو غير مكتمل.');
        }
      } catch (err) {
        alert('حدث خطأ أثناء قراءة ملف النسخة الاحتياطية.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleClearDatabase = () => {
    if (window.confirm('سيتم مسح جميع البيانات من قاعدة البيانات المحلية بشكل نهائي. هل أنت متأكد؟')) {
      localStorage.removeItem(STORAGE_KEY);
      setTeachers([]);
      setClasses([]);
      setSubjects([]);
      setAssignments([]);
      setSchedule(null);
      setSettings({
        workingDays: [0, 1, 2, 3, 4],
        periodsPerDay: 7,
        weekendDay: 5
      });
      alert('تم مسح قاعدة البيانات بنجاح.');
      setActiveTab('inputs');
    }
  };

  const handleClearAll = () => {
    if (window.confirm('حذف الكل من الواجهة الحالية؟ سيتم حفظ هذا التغيير تلقائياً.')) {
      setTeachers([]); setClasses([]); setSubjects([]); setAssignments([]); setSchedule(null); setActiveTab('inputs');
    }
  };

  const exportElement = async (id: string, format: 'pdf' | 'png', fileName: string) => {
    const element = document.getElementById(id);
    if (!element) return;
    const canvas = await html2canvas(element, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
    if (format === 'png') {
      const link = document.createElement('a');
      link.download = `${fileName}.png`; link.href = canvas.toDataURL(); link.click();
    } else {
      const pdf = new jsPDF('l', 'mm', 'a4');
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, 297, (canvas.height * 297) / canvas.width);
      pdf.save(`${fileName}.pdf`);
    }
  };

  const toggleUnavailable = (teacherId: string, day: number, period: number) => {
    setTeachers(prev => prev.map(t => {
      if (t.id !== teacherId) return t;
      const slots = { ...(t.unavailableSlots || {}) };
      const daySlots = [...(slots[day] || [])];
      slots[day] = daySlots.includes(period) ? daySlots.filter(p => p !== period) : [...daySlots, period];
      return { ...t, unavailableSlots: slots };
    }));
  };

  const handleGenerate = () => {
    if (assignments.length === 0) return alert('أضف الأنصبة أولاً');
    setIsGenerating(true);
    setTimeout(() => {
      const result = generateSchedule(teachers, classes, subjects, assignments, settings);
      setSchedule(result);
      setIsGenerating(false);
      setActiveTab('schedule');
    }, 600);
  };

  const getTeacherName = (id: string) => teachers.find(t => t.id === id)?.name || 'مجهول';
  const getSubjectName = (id: string) => subjects.find(s => s.id === id)?.name || 'مجهول';
  const getClassName = (id: string) => classes.find(c => c.id === id)?.name || 'مجهول';

  // Analysis Logic for Reports and Suggestions
  const analysis = useMemo(() => {
    const classRep: Record<string, Record<string, number>> = {};
    const teachRep: Record<string, { total: number, classBreakdown: Record<string, number> }> = {};
    const errs: string[] = [];
    const suggests: { teacherId: string, classId: string, day: number, period: number }[] = [];

    classes.forEach(c => classRep[c.id] = {});
    teachers.forEach(t => teachRep[t.id] = { total: 0, classBreakdown: {} });

    if (schedule) {
      Object.entries(schedule).forEach(([classId, days]) => {
        Object.entries(days).forEach(([day, periods]) => {
          Object.values(periods).forEach((slot: ScheduleSlot | null) => {
            if (slot) {
              classRep[classId][slot.subjectId] = (classRep[classId][slot.subjectId] || 0) + 1;
              if (teachRep[slot.teacherId]) {
                teachRep[slot.teacherId].total += 1;
                teachRep[slot.teacherId].classBreakdown[classId] = (teachRep[slot.teacherId].classBreakdown[classId] || 0) + 1;
              }
            }
          });
        });
      });

      assignments.forEach(a => {
        let actual = 0;
        Object.values(schedule).forEach(days => {
          Object.values(days).forEach(periods => {
            Object.values(periods).forEach((slot: ScheduleSlot | null) => {
              if (slot && slot.teacherId === a.teacherId && slot.subjectId === a.subjectId && slot.classId === a.classId) actual++;
            });
          });
        });

        if (actual < a.hoursPerWeek) {
          const tName = getTeacherName(a.teacherId);
          const cName = getClassName(a.classId);
          errs.push(`${tName}: عجز في فصل ${cName} (${actual}/${a.hoursPerWeek} حصة)`);

          const t = teachers.find(x => x.id === a.teacherId);
          settings.workingDays.forEach(day => {
            for (let p = 1; p <= settings.periodsPerDay; p++) {
              const isClassFree = !schedule[a.classId][day][p];
              const isTeacherOff = t?.unavailableSlots?.[day]?.includes(p);
              if (isClassFree && isTeacherOff) {
                suggests.push({ teacherId: a.teacherId, classId: a.classId, day, period: p });
              }
            }
          });
        }
      });
    }

    return { classRep, teachRep, mismatches: errs, suggestions: suggests };
  }, [schedule, assignments, classes, teachers, settings]);

  const getTeacherColor = (id: string) => {
    const colors = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f59e0b', '#10b981', '#06b6d4', '#3b82f6'];
    let hash = 0; for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-slate-50 text-slate-900" dir="rtl">
      {/* Sidebar Navigation */}
      <aside className="w-full md:w-64 bg-indigo-900 text-white p-6 sticky top-0 md:h-screen flex flex-col shadow-xl z-20 no-print">
        <div className="flex items-center gap-3 mb-10">
          <div className="bg-white p-2 rounded-lg text-indigo-900"><ICONS.Calendar className="w-6 h-6" /></div>
          <h1 className="text-xl font-bold tracking-tight">البرنامج الأسبوعي</h1>
        </div>
        <nav className="flex-1 space-y-2">
          <button onClick={() => setActiveTab('inputs')} className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all ${activeTab === 'inputs' ? 'bg-indigo-700 shadow-inner' : 'hover:bg-indigo-800'}`}>
            <ICONS.Users className="w-5 h-5 opacity-70" /><span>البيانات الأساسية</span>
          </button>
          <button onClick={() => setActiveTab('schedule')} className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all ${activeTab === 'schedule' ? 'bg-indigo-700 shadow-inner' : 'hover:bg-indigo-800'}`}>
            <ICONS.Sparkles className="w-5 h-5 opacity-70" /><span>جدول الحصص</span>
            {analysis.mismatches.length > 0 && <span className="mr-auto w-2 h-2 bg-rose-500 rounded-full animate-pulse"></span>}
          </button>
          <button onClick={() => setActiveTab('settings')} className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all ${activeTab === 'settings' ? 'bg-indigo-700 shadow-inner' : 'hover:bg-indigo-800'}`}>
            <ICONS.Settings className="w-5 h-5 opacity-70" /><span>الإعدادات</span>
          </button>
          <button onClick={() => setActiveTab('reports')} className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all ${activeTab === 'reports' ? 'bg-indigo-700 shadow-inner' : 'hover:bg-indigo-800'}`}>
            <ICONS.BarChart className="w-5 h-5 opacity-70" /><span>الإحصائيات والتقارير</span>
            {analysis.mismatches.length > 0 && <span className="mr-auto w-2 h-2 bg-rose-500 rounded-full animate-pulse"></span>}
          </button>
          <button onClick={() => setActiveTab('backup')} className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all ${activeTab === 'backup' ? 'bg-indigo-700 shadow-inner' : 'hover:bg-indigo-800'}`}>
            <ICONS.Download className="w-5 h-5 opacity-70" /><span>النسخ الاحتياطي</span>
          </button>
        </nav>
        
        {/* Database Status Indicator */}
        <div className="mt-4 p-3 bg-indigo-950/40 rounded-xl border border-indigo-800 flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${dbStatus === 'saving' ? 'bg-amber-400 animate-ping' : 'bg-emerald-400'}`}></div>
          <span className="text-[10px] font-bold text-indigo-200">
            {dbStatus === 'saving' ? 'جاري حفظ البيانات...' : 'قاعدة البيانات متصلة'}
          </span>
        </div>

        <div className="mt-auto pt-6 border-t border-indigo-800">
           <button onClick={handleGenerate} className="w-full bg-emerald-500 hover:bg-emerald-400 text-white font-bold py-3 rounded-xl shadow-lg flex items-center justify-center gap-2">
            {isGenerating ? 'جاري التوزيع...' : 'توزيع الحصص'}
           </button>
        </div>
      </aside>

      <main className="flex-1 p-4 md:p-10 overflow-y-auto flex flex-col min-h-screen">
        <div className="flex-1">
          {/* Alerts & Suggestions (Visible in specific tabs) */}
          {schedule && analysis.mismatches.length > 0 && (activeTab === 'schedule' || activeTab === 'reports') && (
            <div className="mb-8 space-y-4 no-print">
              <div className="bg-rose-50 border-r-4 border-rose-500 p-4 rounded-xl shadow-sm">
                <div className="flex items-center gap-2 text-rose-800 font-bold mb-1"><ICONS.Trash className="w-4 h-4" /><span>تنبيه: الجدول غير مكتمل</span></div>
                <p className="text-rose-700 text-xs">لم يتم توزيع بعض الحصص بسبب تضارب في ساعات التفريغ أو عدم توفر فصول فارغة.</p>
              </div>
              
              {analysis.suggestions.length > 0 && (
                <div className="bg-amber-50 border-r-4 border-amber-500 p-4 rounded-xl shadow-sm">
                  <div className="flex items-center gap-2 text-amber-800 font-bold mb-2"><ICONS.Sparkles className="w-4 h-4" /><span>اقتراحات لحل المشكلة (تحرير التفريغ)</span></div>
                  <div className="text-xs text-amber-700 space-y-2">
                    <p>لإتمام النصاب، يُنصح بإلغاء "تفريغ" الحصص التالية لهؤلاء المعلمين:</p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {analysis.suggestions.slice(0, 8).map((s, i) => (
                        <div key={i} className="bg-white px-3 py-1.5 rounded-lg border border-amber-200 shadow-sm flex items-center gap-2">
                          <span className="font-bold">{getTeacherName(s.teacherId)}</span>
                          <span className="text-slate-400">←</span>
                          <span className="bg-amber-100 px-2 rounded font-medium">{DAYS_OF_WEEK.find(d => d.id === s.day)?.name} الحصة {s.period}</span>
                        </div>
                      ))}
                      {analysis.suggestions.length > 8 && <span className="p-1 text-slate-400">...وغيرها</span>}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'inputs' && (
            <div className="space-y-8 max-w-5xl mx-auto">
              <header className="flex flex-col md:flex-row justify-between gap-4">
                <div><h2 className="text-3xl font-bold">البيانات الأساسية</h2><p className="text-slate-500 text-sm">أضف المعلمين والفصول والأنصبة المطلوبة (يتم الحفظ تلقائياً)</p></div>
                <div className="flex gap-2">
                  <button onClick={handleClearAll} className="bg-white border text-rose-500 px-4 py-2 rounded-xl font-bold hover:bg-rose-50 transition-all">مسح الكل</button>
                  <label className="bg-indigo-600 text-white px-4 py-2 rounded-xl font-bold cursor-pointer hover:bg-indigo-700 transition-all">استيراد إكسيل <input type="file" hidden onChange={handleExcelImportComprehensive} /></label>
                </div>
              </header>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-2xl shadow-sm border">
                  <h3 className="font-bold mb-4 flex items-center gap-2"><div className="w-1 h-5 bg-indigo-500 rounded"></div>المعلمون</h3>
                  <div className="flex gap-2 mb-4">
                    <input type="text" value={newTeacherName} onChange={(e) => setNewTeacherName(e.target.value)} placeholder="الاسم" className="flex-1 p-2 border rounded-lg text-sm" />
                    <button onClick={() => {if(newTeacherName){setTeachers([...teachers, {id:crypto.randomUUID(), name:newTeacherName}]); setNewTeacherName('');}}} className="bg-indigo-500 text-white p-2 rounded-lg hover:bg-indigo-600 transition-all"><ICONS.Plus/></button>
                  </div>
                  <ul className="space-y-2 max-h-64 overflow-auto">
                    {teachers.map(t => (
                      <li key={t.id} className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                        <div className="flex justify-between items-center text-sm">
                          <span className="font-bold text-slate-700">{t.name}</span>
                          <div className="flex gap-1">
                            <button onClick={() => setEditingTeacherId(editingTeacherId === t.id ? null : t.id)} className={`p-1.5 rounded transition-all ${editingTeacherId === t.id ? 'bg-amber-100 text-amber-600 shadow-sm' : 'text-slate-400 hover:bg-slate-200'}`} title="تعديل التفريغ"><ICONS.Clock className="w-4 h-4"/></button>
                            <button onClick={() => setTeachers(teachers.filter(x => x.id !== t.id))} className="text-rose-400 p-1.5 hover:text-rose-600 transition-all"><ICONS.Trash className="w-4 h-4"/></button>
                          </div>
                        </div>
                        {editingTeacherId === t.id && (
                          <div className="mt-3 bg-white p-2 rounded border border-amber-100 space-y-2 shadow-sm animate-in fade-in slide-in-from-top-2">
                            {settings.workingDays.map(d => (
                              <div key={d} className="flex items-center gap-2">
                                <span className="text-[10px] w-10 font-bold opacity-60">{DAYS_OF_WEEK.find(dw => dw.id === d)?.name}</span>
                                <div className="flex flex-wrap gap-1">
                                  {Array.from({length: settings.periodsPerDay}).map((_, p) => (
                                    <button key={p} onClick={() => toggleUnavailable(t.id, d, p+1)} className={`w-6 h-6 rounded border text-[9px] transition-all ${t.unavailableSlots?.[d]?.includes(p+1) ? 'bg-rose-500 text-white border-rose-600 shadow-inner' : 'bg-slate-50 hover:bg-indigo-50'}`}>{p+1}</button>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border">
                  <h3 className="font-bold mb-4 flex items-center gap-2"><div className="w-1 h-5 bg-amber-500 rounded"></div>الفصول</h3>
                  <div className="flex gap-2 mb-4">
                    <input type="text" value={newClassName} onChange={(e) => setNewClassName(e.target.value)} placeholder="اسم الفصل" className="flex-1 p-2 border rounded-lg text-sm" />
                    <button onClick={() => {if(newClassName){setClasses([...classes, {id:crypto.randomUUID(), name:newClassName}]); setNewClassName('');}}} className="bg-indigo-500 text-white p-2 rounded-lg hover:bg-indigo-600 transition-all"><ICONS.Plus/></button>
                  </div>
                  <ul className="space-y-2 max-h-64 overflow-auto">
                    {classes.map(c => <li key={c.id} className="flex justify-between items-center bg-slate-50 p-2 rounded-lg text-sm">{c.name} <button onClick={() => setClasses(classes.filter(x => x.id !== c.id))} className="text-rose-400 hover:text-rose-600"><ICONS.Trash className="w-4 h-4"/></button></li>)}
                  </ul>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border">
                  <h3 className="font-bold mb-4 flex items-center gap-2"><div className="w-1 h-5 bg-emerald-500 rounded"></div>المواد</h3>
                  <div className="flex gap-2 mb-4">
                    <input type="text" value={newSubjectName} onChange={(e) => setNewSubjectName(e.target.value)} placeholder="اسم المادة" className="flex-1 p-2 border rounded-lg text-sm" />
                    <button onClick={() => {if(newSubjectName){setSubjects([...subjects, {id:crypto.randomUUID(), name:newSubjectName}]); setNewSubjectName('');}}} className="bg-indigo-500 text-white p-2 rounded-lg hover:bg-indigo-600 transition-all"><ICONS.Plus/></button>
                  </div>
                  <ul className="space-y-2 max-h-64 overflow-auto">
                    {subjects.map(s => <li key={s.id} className="flex justify-between items-center bg-slate-50 p-2 rounded-lg text-sm">{s.name} <button onClick={() => setSubjects(subjects.filter(x => x.id !== s.id))} className="text-rose-400 hover:text-rose-600"><ICONS.Trash className="w-4 h-4"/></button></li>)}
                  </ul>
                </div>
              </div>

              <div className="bg-white p-8 rounded-2xl shadow-sm border">
                <h3 className="text-xl font-bold mb-6">توزيع الأنصبة</h3>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-slate-50 p-4 rounded-2xl mb-6 shadow-inner">
                  <select className="p-2 border rounded-lg text-sm" value={assignTeacher} onChange={(e) => setAssignTeacher(e.target.value)}><option value="">المعلم</option>{teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
                  <select className="p-2 border rounded-lg text-sm" value={assignSubject} onChange={(e) => setAssignSubject(e.target.value)}><option value="">المادة</option>{subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
                  <select className="p-2 border rounded-lg text-sm" value={assignClass} onChange={(e) => setAssignClass(e.target.value)}><option value="">الفصل</option>{classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
                  <div className="flex gap-2">
                    <input type="number" min="1" value={assignHours} onChange={(e) => setAssignHours(parseInt(e.target.value))} className="w-16 p-2 border rounded-lg text-sm" />
                    <button onClick={() => {if(assignTeacher && assignSubject && assignClass){setAssignments([...assignments, {id:crypto.randomUUID(), teacherId:assignTeacher, subjectId:assignSubject, classId:assignClass, hoursPerWeek:assignHours}]);}}} className="flex-1 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 transition-all shadow-sm">إضافة</button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-sm">
                    <thead><tr className="border-b text-slate-400 font-medium"><th className="pb-3 px-2">المعلم</th><th className="pb-3 px-2">المادة</th><th className="pb-3 px-2">الفصل</th><th className="pb-3 px-2 text-center">الساعات</th><th className="pb-3 px-2"></th></tr></thead>
                    <tbody>{assignments.map(a => (<tr key={a.id} className="border-b hover:bg-slate-50 transition-colors"><td className="py-4 px-2">{getTeacherName(a.teacherId)}</td><td className="py-4 px-2">{getSubjectName(a.subjectId)}</td><td className="py-4 px-2 font-bold">{getClassName(a.classId)}</td><td className="py-4 px-2 text-center font-bold text-indigo-600">{a.hoursPerWeek}</td><td className="py-4 px-2 text-left"><button onClick={() => setAssignments(assignments.filter(x => x.id !== a.id))} className="text-rose-400 hover:text-rose-600 transition-all"><ICONS.Trash className="w-4 h-4"/></button></td></tr>))}</tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'schedule' && (
            <div className="space-y-6 max-w-7xl mx-auto">
              <header className="flex justify-between items-center no-print">
                <h2 className="text-2xl font-bold">جدول الحصص</h2>
                <div className="flex gap-2">
                  <button onClick={() => setIsTeacherViewOpen(!isTeacherViewOpen)} className="bg-white border px-4 py-2 rounded-xl flex items-center gap-2 font-bold text-sm shadow-sm transition-all hover:bg-slate-50"><ICONS.Users className="w-4 h-4" /> جداول المعلمين</button>
                  <button onClick={handleGenerate} className="bg-indigo-600 text-white px-4 py-2 rounded-xl shadow-md font-bold text-sm transition-all hover:bg-indigo-700">إعادة التوزيع</button>
                </div>
              </header>

              {isTeacherViewOpen && (
                <div className="bg-white p-6 rounded-3xl shadow-lg border no-print mb-10 animate-in zoom-in-95">
                  <div className="flex justify-between items-center mb-6"><h3 className="font-bold text-lg text-indigo-900">برنامج المعلم الخاص</h3><button onClick={() => setIsTeacherViewOpen(false)} className="text-slate-400 text-2xl hover:text-slate-600">&times;</button></div>
                  <div className="flex gap-4 mb-6">
                    <select className="flex-1 p-3 border rounded-xl bg-slate-50 shadow-inner" value={selectedTeacherId} onChange={(e) => setSelectedTeacherId(e.target.value)}><option value="">اختر المعلم من القائمة...</option>{teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
                    {selectedTeacherId && <button onClick={() => exportElement('teacher-specific-schedule', 'png', `جدول_${getTeacherName(selectedTeacherId)}`)} className="bg-emerald-50 text-emerald-600 px-4 py-3 rounded-xl flex items-center gap-2 font-bold text-sm shadow-sm hover:bg-emerald-100 transition-all"><ICONS.Image className="w-4 h-4" /> حفظ صورة</button>}
                  </div>
                  {selectedTeacherId && schedule && (
                    <div id="teacher-specific-schedule" className="overflow-x-auto bg-white p-4 rounded-2xl border">
                      <h4 className="text-center font-bold text-xl mb-6 text-indigo-950">جدول الأستاذ: {getTeacherName(selectedTeacherId)}</h4>
                      <table className="w-full text-center border-collapse">
                        <thead className="bg-indigo-600 text-white"><tr><th className="p-3 border text-xs">اليوم</th>{Array.from({length: settings.periodsPerDay}).map((_, i) => <th key={i} className="p-3 border text-xs">الحصة {i + 1}</th>)}</tr></thead>
                        <tbody>
                          {settings.workingDays.map(dayId => (
                            <tr key={dayId} className="hover:bg-indigo-50/30 transition-colors">
                              <td className="p-3 border font-bold text-xs bg-slate-50 text-indigo-900">{DAYS_OF_WEEK.find(d => d.id === dayId)?.name}</td>
                              {Array.from({length: settings.periodsPerDay}).map((_, pIdx) => {
                                const p = pIdx + 1;
                                let slot = null; Object.entries(schedule).forEach(([clsId, days]) => { if(days[dayId][p]?.teacherId === selectedTeacherId) slot = {...days[dayId][p], className: getClassName(clsId)}; });
                                const isOff = teachers.find(t => t.id === selectedTeacherId)?.unavailableSlots?.[dayId]?.includes(p);
                                return <td key={p} className={`p-3 border text-[10px] min-w-[90px] h-20 transition-all ${isOff ? 'bg-rose-50/50' : ''}`}>{slot ? <div><div className="font-bold text-indigo-700 text-sm">{(slot as any).className}</div><div className="opacity-60 font-medium">{getSubjectName((slot as any).subjectId)}</div></div> : isOff ? <span className="text-rose-400 font-bold bg-rose-50 px-2 py-1 rounded">تفريغ</span> : <span className="text-slate-200">-</span>}</td>;
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {schedule && classes.map(cls => (
                <div key={cls.id} id={`class-schedule-${cls.id}`} className="bg-white rounded-3xl shadow-sm border mb-10 overflow-hidden break-inside-avoid">
                  <div className="bg-slate-50 px-6 py-4 border-b flex justify-between items-center"><h3 className="font-bold text-slate-800">جدول فصل: {cls.name}</h3><button onClick={() => exportElement(`class-schedule-${cls.id}`, 'png', `جدول_فصل_${cls.name}`)} className="text-emerald-500 hover:bg-emerald-50 p-2 rounded no-print transition-all"><ICONS.Image className="w-5 h-5"/></button></div>
                  <div className="overflow-x-auto"><table className="w-full text-center border-collapse table-fixed min-w-[850px]">
                    <thead className="bg-slate-100"><tr><th className="p-4 border-l border-b w-24 text-sm font-bold text-slate-600">اليوم</th>{Array.from({length: settings.periodsPerDay}).map((_, i) => <th key={i} className="p-4 border-b text-sm font-bold text-slate-600">الحصة {i + 1}</th>)}</tr></thead>
                    <tbody>{settings.workingDays.map(dayId => (<tr key={dayId} className="hover:bg-slate-50/50 transition-colors"><td className="p-4 font-bold border-l border-b bg-indigo-50/30 text-xs text-indigo-900">{DAYS_OF_WEEK.find(d => d.id === dayId)?.name}</td>{Array.from({length: settings.periodsPerDay}).map((_, pIdx) => {const p = pIdx + 1; const slot = schedule[cls.id][dayId][p]; return <td key={p} className="p-2 border-b border-l h-28">{slot ? <div className="bg-indigo-50 rounded-2xl px-2 py-4 border border-indigo-100 h-full flex flex-col justify-center shadow-sm animate-in fade-in scale-95"><div className="font-bold text-indigo-800 text-xs">{getSubjectName(slot.subjectId)}</div><div className="text-[10px] text-indigo-400 font-medium mt-1">{getTeacherName(slot.teacherId)}</div></div> : <span className="text-slate-100 font-light text-xl">.</span>}</td>;})}</tr>))}</tbody>
                  </table></div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'reports' && (
            <div className="space-y-12 max-w-6xl mx-auto">
              <header><h2 className="text-3xl font-bold mb-2">التقارير والإحصائيات</h2><p className="text-slate-500">متابعة دقيقة لمستوى إتمام النصاب الأسبوعي لكل معلم وفصل.</p></header>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <section className="space-y-6">
                  <h3 className="text-xl font-bold flex items-center gap-2"><div className="w-1.5 h-6 bg-indigo-600 rounded"></div>توزيع حصص الفصول</h3>
                  {classes.map(c => (
                    <div key={c.id} className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
                      <h4 className="font-bold text-slate-700 border-b pb-3 mb-4 flex justify-between"><span>فصل {c.name}</span> <span className="text-xs text-slate-400 font-normal">إجمالي الحصص</span></h4>
                      <div className="space-y-3">
                        {Object.entries(analysis.classRep[c.id] || {}).map(([sId, hours]) => {
                          const target = assignments.find(a => a.classId === c.id && a.subjectId === sId)?.hoursPerWeek || 0;
                          const isLess = hours < target;
                          return (
                            <div key={sId} className="flex justify-between items-center text-sm">
                              <span className="text-slate-600">{getSubjectName(sId)}</span>
                              <div className={`font-bold px-3 py-1 rounded-full text-xs transition-colors shadow-sm ${isLess ? 'bg-rose-100 text-rose-600 border border-rose-200' : 'bg-indigo-50 text-indigo-600 border border-indigo-100'}`}>
                                {hours} من {target} حصة
                              </div>
                            </div>
                          );
                        })}
                        {Object.keys(analysis.classRep[c.id] || {}).length === 0 && <div className="text-slate-400 text-xs italic text-center py-4">لا توجد بيانات توزيع لهذا الفصل</div>}
                      </div>
                    </div>
                  ))}
                </section>
                
                <section className="space-y-6">
                  <h3 className="text-xl font-bold flex items-center gap-2"><div className="w-1.5 h-6 bg-emerald-600 rounded"></div>أنصبة المعلمين</h3>
                  {teachers.map(t => {
                    const target = assignments.filter(a => a.teacherId === t.id).reduce((s, a) => s + a.hoursPerWeek, 0);
                    const actual = analysis.teachRep[t.id].total;
                    const isLess = actual < target;
                    return (
                      <div key={t.id} className={`bg-white p-6 rounded-3xl shadow-sm border transition-all ${isLess ? 'border-rose-300 ring-2 ring-rose-50' : 'border-slate-100'}`}>
                        <div className="flex justify-between items-center mb-6">
                          <div><h4 className="font-bold text-slate-800 text-lg">{t.name}</h4><p className={`text-xs mt-1 ${isLess ? 'text-rose-600 font-bold' : 'text-slate-400'}`}>المجدول: {actual} / النصاب: {target}</p></div>
                          <div className="h-12 w-12 rounded-2xl flex items-center justify-center text-white font-bold text-sm shadow-md" style={{ backgroundColor: getTeacherColor(t.id) }}>{t.name[0]}</div>
                        </div>
                        <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                          {Object.entries(analysis.teachRep[t.id].classBreakdown).map(([cId, hrs]) => (
                            <div key={cId} className="bg-slate-50 p-2.5 rounded-2xl border border-slate-100 flex flex-col items-center shadow-inner">
                              <span className="text-[10px] text-slate-500">{getClassName(cId)}</span>
                              <span className="text-xs font-bold text-slate-700">{hrs} حصة</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </section>
              </div>
            </div>
          )}

          {activeTab === 'backup' && (
            <div className="max-w-4xl mx-auto space-y-12">
              <header>
                <h2 className="text-3xl font-bold text-slate-800 mb-2">قاعدة البيانات والنسخ الاحتياطي</h2>
                <p className="text-slate-500">تتم مزامنة بياناتك تلقائياً مع قاعدة البيانات المحلية في المتصفح.</p>
              </header>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="bg-indigo-600 text-white p-8 rounded-[2rem] shadow-xl hover:shadow-2xl transition-all relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform"><ICONS.Download className="w-32 h-32" /></div>
                  <div className="relative z-10">
                    <h3 className="text-2xl font-bold mb-4">تصدير النسخة الاحتياطية</h3>
                    <p className="text-indigo-100 text-sm mb-8 leading-relaxed">قم بتحميل نسخة خارجية للبيانات للعمل عليها من جهاز آخر أو لاسترجاعها لاحقاً.</p>
                    <button onClick={handleBackup} className="w-full bg-white text-indigo-700 font-bold py-4 rounded-2xl flex items-center justify-center gap-3 shadow-lg hover:bg-indigo-50 transition-all">
                      <ICONS.Download className="w-6 h-6" />
                      تحميل ملف النسخة
                    </button>
                  </div>
                </div>

                <div className="bg-white border-2 border-indigo-100 p-8 rounded-[2rem] shadow-sm hover:border-indigo-300 transition-all group">
                  <h3 className="text-2xl font-bold text-indigo-900 mb-4">استيراد النسخة الاحتياطية</h3>
                  <p className="text-slate-500 text-sm mb-8 leading-relaxed">اختر ملف نسخة احتياطية (JSON) لاستبدال البيانات الحالية في قاعدة البيانات.</p>
                  <label className="w-full bg-indigo-50 text-indigo-700 font-bold py-4 rounded-2xl flex items-center justify-center gap-3 cursor-pointer border-2 border-dashed border-indigo-200 hover:bg-indigo-100 transition-all group-hover:border-indigo-400">
                    <ICONS.FileSpreadsheet className="w-6 h-6" />
                    اختيار ملف JSON
                    <input type="file" hidden accept=".json" onChange={handleRestore} />
                  </label>
                </div>
              </div>

              {/* Dangerous Area */}
              <div className="bg-rose-50 border border-rose-100 p-8 rounded-[2rem] shadow-sm">
                <div className="flex flex-col md:flex-row justify-between items-center gap-6">
                  <div>
                    <h3 className="text-xl font-bold text-rose-800 mb-2">منطقة الخطر</h3>
                    <p className="text-rose-600 text-sm">سيؤدي مسح قاعدة البيانات إلى حذف كافة المدخلات والجداول نهائياً من هذا المتصفح.</p>
                  </div>
                  <button onClick={handleClearDatabase} className="bg-rose-500 text-white px-8 py-4 rounded-2xl font-bold hover:bg-rose-600 transition-all shadow-md active:scale-95">
                    مسح قاعدة البيانات نهائياً
                  </button>
                </div>
              </div>

              <div className="bg-slate-100 p-6 rounded-2xl border border-slate-200">
                <h4 className="font-bold text-slate-700 mb-2 flex items-center gap-2"><ICONS.Clock className="w-4 h-4" /> حالة التخزين الحالية:</h4>
                <div className="text-xs text-slate-500 grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-white p-3 rounded-xl border">المعلمون: {teachers.length}</div>
                  <div className="bg-white p-3 rounded-xl border">الفصول: {classes.length}</div>
                  <div className="bg-white p-3 rounded-xl border">الأنصبة: {assignments.length}</div>
                  <div className="bg-white p-3 rounded-xl border">المواد: {subjects.length}</div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="space-y-8 max-w-3xl mx-auto">
              <header><h2 className="text-3xl font-bold">إعدادات الدوام الدراسي</h2></header>
              <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-200 space-y-10">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-4">أيام الدوام الأسبوعية</label>
                  <div className="grid grid-cols-4 md:grid-cols-7 gap-2">
                    {DAYS_OF_WEEK.map(day => (
                      <button key={day.id} onClick={() => {
                          const newDays = settings.workingDays.includes(day.id) ? settings.workingDays.filter(d => d !== day.id) : [...settings.workingDays, day.id];
                          setSettings({ ...settings, workingDays: newDays });
                        }} className={`p-3 rounded-2xl text-xs font-bold border transition-all ${settings.workingDays.includes(day.id) ? 'bg-indigo-600 text-white border-indigo-700 shadow-md' : 'bg-white text-slate-500 hover:bg-slate-50'}`}>{day.name}</button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-between p-8 bg-slate-50 rounded-3xl border border-slate-100">
                  <div>
                    <h4 className="font-bold text-slate-800 text-lg">عدد الحصص يومياً</h4>
                    <p className="text-xs text-slate-500 mt-1">يحدد الحد الأقصى لعدد الفترات الدراسية في اليوم الواحد.</p>
                  </div>
                  <div className="flex items-center gap-6">
                    <button onClick={() => setSettings({...settings, periodsPerDay: Math.max(1, settings.periodsPerDay - 1)})} className="w-12 h-12 rounded-2xl border bg-white font-bold text-xl shadow-sm hover:shadow-md transition-all active:scale-95 text-rose-500">-</button>
                    <span className="text-3xl font-bold text-indigo-600 w-12 text-center">{settings.periodsPerDay}</span>
                    <button onClick={() => setSettings({...settings, periodsPerDay: Math.min(12, settings.periodsPerDay + 1)})} className="w-12 h-12 rounded-2xl border bg-white font-bold text-xl shadow-sm hover:shadow-md transition-all active:scale-95 text-emerald-500">+</button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="mt-auto py-8 text-center border-t border-slate-200/60 no-print">
          <p className="text-slate-400 text-sm font-medium tracking-wide">
            تصميم الأستاذ <span className="text-indigo-900 font-bold">عبد الرزاق الموسى</span>
          </p>
        </footer>
      </main>
    </div>
  );
};

export default App;
